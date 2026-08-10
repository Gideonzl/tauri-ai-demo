//! SFTP module — file operations via SSH exec (russh doesn't have built-in SFTP)
//! Uses `ls -la` for directory listing, `stat` for file info, `mkdir`/`rm`/`mv` for file ops

use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileType {
    File,
    Directory,
    Symlink,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub file_type: FileType,
    pub size: u64,
    pub modified: u64,
    pub permissions: u32,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub path: String,
    pub entries: Vec<FileEntry>,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub transferred: u64,
    pub total: u64,
    pub speed: u64,
    pub done: bool,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Parse `ls -la` output line into a FileEntry
fn parse_ls_line(line: &str, dir_path: &str) -> Option<FileEntry> {
    let line = line.trim();
    if line.is_empty() || line.starts_with("total ") {
        return None;
    }

    // Parse: permissions links user group size month day time name
    // -rw-r--r--  1 root root  1024 Jun  4 10:00 filename
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 9 {
        return None;
    }

    let perms = parts[0];
    let size = parts[4].parse::<u64>().unwrap_or(0);
    // Find name — fields are: perms(0) links(1) owner(2) group(3) size(4) month(5) day(6) time(7) name(8+)
    // Standard: 9 fields, name at index 8
    // Name with spaces: >9 fields, name starts at index 9
    let name = if parts.len() == 9 {
        parts[8].to_string()
    } else if parts.len() > 9 {
        parts[9..].join(" ")
    } else {
        return None;
    };

    if name == "." || name == ".." {
        return None;
    }
    if name.is_empty() {
        return None;
    }

    let file_type = match perms.chars().next() {
        Some('d') => FileType::Directory,
        Some('l') => FileType::Symlink,
        Some('-') => FileType::File,
        _ => FileType::Other,
    };

    let path = if dir_path == "/" {
        format!("/{}", name)
    } else {
        format!("{}/{}", dir_path, name)
    };

    // Parse permissions from string like "rwxr-xr-x" to octal
    let perm_octal = perms_to_octal(&perms[1..]);

    Some(FileEntry {
        name: name.clone(),
        path,
        file_type,
        size,
        modified: 0,
        permissions: perm_octal,
        is_hidden: is_hidden(&name),
    })
}

/// Convert permission string "rwxr-xr-x" to octal 0755
fn perms_to_octal(perms: &str) -> u32 {
    let mut result = 0u32;
    for (i, ch) in perms.chars().enumerate() {
        if i < 9 {
            let bit = 8 - (i % 3) - 1; // r=4, w=2, x=1
            if ch == 'r' || ch == 'w' || ch == 'x' || ch == 's' || ch == 't' {
                result |= 1 << (bit + (2 - i / 3) * 3);
            }
        }
    }
    result
}

/// Read directory listing via `ls -la` over SSH
pub async fn read_dir(session_id: &str, path: &str) -> AppResult<DirectoryListing> {
    let cmd = format!("ls -la {} 2>/dev/null || echo '__ERROR__'", path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;

    if output.contains("__ERROR__") {
        return Err(AppError::new(
            ErrorCode::SftpReadDirFailed,
            format!("Cannot read directory: {}", path),
        ));
    }

    let entries: Vec<FileEntry> = output
        .lines()
        .filter_map(|line| parse_ls_line(line, path))
        .collect();

    // Sort: directories first, then by name
    let mut sorted = entries;
    sorted.sort_by(|a, b| {
        if a.file_type != b.file_type {
            if a.file_type == FileType::Directory {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(DirectoryListing {
        path: path.into(),
        entries: sorted,
        complete: true,
    })
}

/// Get file stat via `stat` command
pub async fn stat(session_id: &str, path: &str) -> AppResult<FileEntry> {
    let cmd = format!(
        "stat -c '%F,%s,%a,%Y' {} 2>/dev/null || echo '__ERROR__'",
        path
    );
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    let output = output.trim();

    if output.contains("__ERROR__") {
        return Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("Cannot stat: {}", path),
        ));
    }

    let parts: Vec<&str> = output.splitn(4, ',').collect();
    let name = path.rsplit('/').next().unwrap_or(path);

    let file_type = match parts.get(0).unwrap_or(&"") {
        s if s.contains("directory") => FileType::Directory,
        s if s.contains("symbolic link") => FileType::Symlink,
        _ => FileType::File,
    };
    let size = parts.get(1).unwrap_or(&"0").parse::<u64>().unwrap_or(0);
    let perms = parts
        .get(2)
        .unwrap_or(&"644")
        .parse::<u32>()
        .unwrap_or(0o644);
    let modified = parts.get(3).unwrap_or(&"0").parse::<u64>().unwrap_or(0);

    Ok(FileEntry {
        name: name.into(),
        path: path.into(),
        file_type,
        size,
        modified,
        permissions: perms,
        is_hidden: is_hidden(name),
    })
}

/// Create directory
pub async fn create_dir(session_id: &str, path: &str) -> AppResult<()> {
    let cmd = format!("mkdir -p {} 2>&1 || echo '__ERROR__'", path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("mkdir failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

/// Remove file/directory
pub async fn remove(session_id: &str, path: &str, recursive: bool) -> AppResult<()> {
    let flag = if recursive { "-rf" } else { "-d" };
    let cmd = format!("rm {} {} 2>&1 || echo '__ERROR__'", flag, path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("rm failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

/// Rename
pub async fn rename(session_id: &str, old_path: &str, new_path: &str) -> AppResult<()> {
    let cmd = format!("mv {} {} 2>&1 || echo '__ERROR__'", old_path, new_path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("mv failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

/// Upload file (write via SSH exec)
pub async fn upload_file(
    session_id: &str,
    local_path: &str,
    remote_path: &str,
) -> AppResult<TransferProgress> {
    let data = std::fs::read(local_path)
        .map_err(|e| AppError::new(ErrorCode::IoError, format!("read local: {}", e)))?;
    let total = data.len() as u64;

    // Use base64 + dd to write file content
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    let cmd = format!(
        "echo '{}' | base64 -d > {} 2>&1 || echo '__ERROR__'",
        b64, remote_path
    );
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;

    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpUploadFailed,
            format!("upload failed: {}", output),
        ))
    } else {
        Ok(TransferProgress {
            transfer_id: format!(
                "up-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            ),
            transferred: total,
            total,
            speed: total,
            done: true,
        })
    }
}

/// Download file (read via SSH exec + base64)
pub async fn download_file(
    session_id: &str,
    remote_path: &str,
    local_path: &str,
) -> AppResult<TransferProgress> {
    let cmd = format!("base64 {} 2>/dev/null || echo '__ERROR__'", remote_path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    let output = output.trim();

    if output.contains("__ERROR__") {
        return Err(AppError::new(
            ErrorCode::SftpDownloadFailed,
            format!("download failed"),
        ));
    }

    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(output)
        .map_err(|e| AppError::new(ErrorCode::IoError, format!("base64 decode: {}", e)))?;
    let total = data.len() as u64;

    if let Some(parent) = std::path::Path::new(local_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(local_path, &data)
        .map_err(|e| AppError::new(ErrorCode::IoError, format!("write local: {}", e)))?;

    Ok(TransferProgress {
        transfer_id: format!(
            "dl-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ),
        transferred: total,
        total,
        speed: total,
        done: true,
    })
}

/// Chmod
pub async fn chmod(session_id: &str, path: &str, mode: &str) -> AppResult<()> {
    let cmd = format!("chmod {} {} 2>&1 || echo '__ERROR__'", mode, path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("chmod failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

/// Touch
pub async fn touch(session_id: &str, path: &str) -> AppResult<()> {
    let cmd = format!("touch {} 2>&1 || echo '__ERROR__'", path);
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("touch failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

/// Compress via tar
pub async fn compress(
    session_id: &str,
    source_path: &str,
    target_path: &str,
    decompress: bool,
) -> AppResult<()> {
    let cmd = if decompress {
        format!(
            "tar -xzf {} -C $(dirname {}) 2>&1 || echo '__ERROR__'",
            target_path, target_path
        )
    } else {
        format!(
            "tar -czf {} {} 2>&1 || echo '__ERROR__'",
            target_path, source_path
        )
    };
    let output = crate::protocol::ssh::exec_command(session_id, &cmd).await?;
    if output.contains("__ERROR__") {
        Err(AppError::new(
            ErrorCode::SftpFileOpFailed,
            format!("compress failed: {}", output),
        ))
    } else {
        Ok(())
    }
}

// Legacy API stubs
pub async fn open_sftp_channel(session_id: &str) -> AppResult<String> {
    Ok(format!("sftp-{}", session_id))
}
pub async fn close_sftp_channel(_sftp_id: &str) -> AppResult<()> {
    Ok(())
}
