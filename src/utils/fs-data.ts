// Shared filesystem data — used by both TerminalPanel and SftpTree
// Format: path -> array of entries (dirs end with /)

export const FS: Record<string, string[]> = {
'/': ['bin/','boot/','dev/','etc/','home/','lib/','lib64/','media/','mnt/','opt/','proc/','root/','run/','sbin/','srv/','sys/','tmp/','usr/','var/'],
'/bin': ['bash','bunzip2','bzcat','bzip2','cat','chgrp','chmod','chown','cp','dash','date','dd','df','dir','dmesg','echo','egrep','false','fgrep','find','grep','gunzip','gzip','hostname','kill','less','ln','login','ls','mkdir','mknod','mktemp','more','mount','mountpoint','mv','nano','pidof','ping','ps','pwd','rbash','rm','rmdir','run-parts','sed','sh','sleep','sort','ss','su','sync','tar','tempfile','touch','true','umount','uname','uncompress','vdir','which','zcat','zegrep','zfgrep','zgrep','zless','zmore','znew'],
'/boot': ['config-5.15.0-91-generic','grub/','initrd.img','initrd.img.old','System.map-5.15.0-91-generic','vmlinuz','vmlinuz.old'],
'/dev': ['block/','bsg/','bus/','char/','console','core','cpu/','disk/','fd/','full','fuse','hidraw0','hugepages/','hwrng','initctl','input/','kmsg','log','loop0','loop1','mapper/','mcelog','mem','net/','null','port','ppp','ptmx','pts/','random','rfkill','rtc','rtc0','sda','sda1','sda2','sg0','shm/','snapshot','snd/','stderr','stdin','stdout','tty','tty0','tty1','urandom','usb/','vcs','vcs1','vcsa','vcsa1','vfio/','vga_arbiter','vhci','vhost-net','vhost-vsock','zero'],
'/etc': ['adduser.conf','aliases','alternatives/','apparmor/','apparmor.d/','apt/','bash.bashrc','bindresvport.blacklist','ca-certificates/','ca-certificates.conf','cron.d/','cron.daily/','cron.hourly/','cron.monthly/','cron.weekly/','crontab','dbus-1/','debconf.conf','default/','deluser.conf','depmod.d/','dhcp/','docker/','dpkg/','environment','ethertypes','fstab','gai.conf','group','group-','gshadow','gshadow-','host.conf','hostname','hosts','hosts.allow','hosts.deny','init.d/','initramfs-tools/','inputrc','iproute2/','issue','issue.net','kernel/','ld.so.cache','ld.so.conf','ld.so.conf.d/','legal','libaudit.conf','locale.alias','locale.conf','localtime','logrotate.conf','logrotate.d/','lsb-release','machine-id','magic','magic.mime','mailcap','mailcap.order','manpath.config','mime.types','mke2fs.conf','modprobe.d/','modules','modules-load.d/','motd','mtab','netplan/','network/','NetworkManager/','networks','newt/','nginx/','nsswitch.conf','opt/','os-release','pam.conf','pam.d/','passwd','passwd-','perl/','php/','pm/','polkit-1/','profile','profile.d/','protocols','rc.local','rc0.d/','rc1.d/','rc2.d/','rc3.d/','rc4.d/','rc5.d/','rc6.d/','resolv.conf','rmt','rpc','rsyslog.conf','rsyslog.d/','security/','selinux/','services','shadow','shadow-','shells','skel/','ssh/','ssl/','subgid','subuid','sudoers','sudoers.d/','sysctl.conf','sysctl.d/','systemd/','terminfo/','timezone','tmpfiles.d/','ucf.conf','udev/','update-motd.d/','vim/','wgetrc','X11/','xdg/'],
'/etc/nginx': ['conf.d/','fastcgi.conf','fastcgi_params','koi-utf','koi-win','mime.types','modules-available/','modules-enabled/','nginx.conf','proxy_params','scgi_params','sites-available/','sites-enabled/','snippets/','uwsgi_params','win-utf'],
'/etc/nginx/conf.d': ['default.conf','api.conf','ssl.conf'],
'/etc/nginx/sites-available': ['default','api'],
'/etc/nginx/sites-enabled': ['default'],
'/etc/ssh': ['moduli','ssh_config','ssh_config.d/','sshd_config','sshd_config.d/','ssh_host_ecdsa_key','ssh_host_ecdsa_key.pub','ssh_host_ed25519_key','ssh_host_ed25519_key.pub','ssh_host_rsa_key','ssh_host_rsa_key.pub'],
'/etc/ssl': ['certs/','openssl.cnf','private/'],
'/etc/docker': ['daemon.json','key.json'],
'/etc/systemd': ['system/','user/','journald.conf','logind.conf','resolved.conf','timesyncd.conf'],
'/etc/systemd/system': ['nginx.service','docker.service','sshd.service','postgresql.service','redis.service','app.service','multi-user.target.wants/'],
'/home': ['admin/','deploy/','ubuntu/','www-data/','git/'],
'/home/admin': ['.bash_history','.bash_logout','.bashrc','.cache/','.config/','.gitconfig','.local/','.npm/','.profile','.python_history','.ssh/','.viminfo','.wget-hsts','backups/','notes.txt','projects/','scripts/','todo.md'],
'/home/admin/.ssh': ['authorized_keys','config','id_ed25519','id_ed25519.pub','known_hosts'],
'/home/admin/projects': ['api-server/','README.md','webapp/'],
'/home/admin/projects/webapp': ['.env','.gitignore','Dockerfile','index.html','node_modules/','package.json','public/','README.md','src/','tsconfig.json','vite.config.ts'],
'/home/admin/projects/webapp/src': ['App.vue','components/','main.ts','router/','stores/','styles/','utils/','views/'],
'/home/admin/projects/api-server': ['.env','app/','config.yaml','Dockerfile','main.py','requirements.txt','tests/'],
'/home/admin/scripts': ['backup.sh','cleanup.sh','deploy.sh','healthcheck.sh','monitor.sh','update.sh'],
'/home/admin/backups': ['backup-20260605.tar.gz','backup-20260607.tar.gz'],
'/lib': ['firmware/','modules/','systemd/','udev/','x86_64-linux-gnu/'],
'/lib/x86_64-linux-gnu': ['ld-linux-x86-64.so.2','libc.so.6','libcrypt.so.1','libcrypto.so.3','libdl.so.2','libm.so.6','libnsl.so.1','libnss_compat.so.2','libnss_dns.so.2','libnss_files.so.2','libpthread.so.0','libresolv.so.2','librt.so.1','libssl.so.3','libstdc++.so.6','libz.so.1'],
'/media': ['cdrom/','usb/'],
'/mnt': ['backup/','data/','share/'],
'/opt': ['1panel/','apps/','containerd/','tools/'],
'/opt/1panel': ['docker-compose.yml','install.sh','logs/','data/','config/','backup/'],
'/opt/1panel/logs': ['1panel.log','access.log','error.log'],
'/opt/1panel/data': ['db.sqlite','backups/'],
'/opt/1panel/config': ['config.yaml','settings.json'],
'/opt/1panel/backup': ['backup-20260601.tar.gz'],
'/opt/apps': ['database/','monitoring/'],
'/opt/containerd': ['config.toml','root/','state/'],
'/opt/tools': ['jq','node_exporter','yq'],
'/proc': ['cpuinfo','meminfo','uptime','loadavg','version','stat','mounts','filesystems','partitions','swaps','net/','sys/','self/'],
'/root': ['.bash_history','.bash_logout','.bashrc','.cache/','.cargo/','.config/','.gitconfig','.local/','.npm/','.profile','.python_history','.ssh/','.viminfo','.wget-hsts','0.0.0.0:8081','1panel-v2.1.13-linux-amd64/','1panel-v2.1.13-linux-amd64.tar.gz','app/','backups/','data/','dd_schedule.log','deploy.sh','docker-compose.yml','Dockerfile','f2f_migrate_error_.log','f2f_migrate_schedule_.log','install.sh','linux.log','logs/','monitor.sh','notes.txt','package.json','README.md','scripts/','setup.sh','SMS-Agent/','SMS-Agent.tar.gz','SMS-Agent.tar.gz.cms','SMS-Agent.tar.gz.cms.crl','SMS-Agent.tar.gz.cms.crl.1','SMS-Agent.tar.gz.sha256','todo.md','update.sh'],
'/root/1panel-v2.1.13-linux-amd64': ['1panel-agent','1panel-agent.service','1panel-core','1panel-core.service','1pctl','GeoIP.mmdb','get-docker.sh','initscript/','install.log','install.sh','lang/'],
'/root/1panel-v2.1.13-linux-amd64/initscript': ['1panel-agent.init','1panel-agent.openrc','1panel-agent.procd','1panel-agent.service','1panel-core.init','1panel-core.openrc','1panel-core.procd','1panel-core.service'],
'/root/1panel-v2.1.13-linux-amd64/lang': ['en.sh','fa.sh','pt-BR.sh','ru.sh','zh.sh'],
'/root/SMS-Agent': ['agent/','libsrcAgent.so','linux/','linuxmain','Logs/','tmp/'],
'/root/SMS-Agent/agent': ['config/','ioblock/','libsrcAgent.so'],
'/root/SMS-Agent/agent/config': ['auth.cfg','blocktransferlayer.cfg','check-property.cfg','cloud-region.json','commands.xml','disk.cfg','disk_mapping.record','error.cfg','ErrorCode.ini','g-property.cfg','init.cfg','ntp.conf','peAgent_log.conf','platform.cfg','public-net.cfg','rollback.cfg','sms_domain.txt','sms_known_hosts','sms_ssh_rsa_identity','sms_ssh_rsa_identity.pub','srcAgent.ini','taskInfo'],
'/root/SMS-Agent/agent/ioblock': ['destAgent.tar.gz','x64/','x86/'],
'/root/SMS-Agent/linux': ['resources/'],
'/root/SMS-Agent/linux/resources': ['shell/','xorg.conf/'],
'/root/SMS-Agent/linux/resources/shell': ['base.sh','centos2hce_check.sh','check_grub.sh','chroot_and_execute.sh','create_btrfs_sub_volume.sh','get_disk_info.sh','get_os_info.sh','install_grub2.sh','list_disks.sh','logging.sh','make_file_system.sh','migrate_by_tar.sh','modify_linux_conf.sh','pre_check.sh','synchronize.sh','update_grub2_conf.sh','update_initrd.sh'],
'/root/SMS-Agent/Logs': ['check_all.log','check.log','f2f_migrate_error_.log','f2f_migrate_schedule_.log','SmsAgent_Error.log','SmsAgent_Info.log','sms_boot_efi_.log','sms_.log','SparseFile_Record.log','startup.log','tcRecord.log'],
'/root/.ssh': ['authorized_keys','config','id_ed25519','id_ed25519.pub','known_hosts'],
'/root/app': ['.env','.gitignore','config.json','ecosystem.config.js','main.js','node_modules/','package.json','public/','README.md','src/'],
'/root/app/src': ['config.js','index.js','middleware.js','routes.js','utils.js'],
'/root/app/public': ['app.js','favicon.ico','index.html','style.css'],
'/root/backups': ['config-backup.tar.gz','db-20260601.tar.gz','db-20260607.tar.gz'],
'/root/data': ['export.json','orders.csv','products.csv','users.csv'],
'/root/logs': ['access.log','app.log','cron.log','error.log'],
'/root/scripts': ['backup-db.sh','clean-logs.sh','deploy-prod.sh','healthcheck.sh','update-ssl.sh'],
'/run': ['docker.sock','lock/','log/','mount/','rpcbind.sock','sshd.pid','systemd/','udev/','user/','utmp'],
'/sbin': ['fdisk','fsck','init','ip','mkfs','mkfs.ext4','reboot','route','shutdown','swapoff','swapon','sysctl','systemctl'],
'/srv': ['backups/','data/','ftp/','www/'],
'/sys': ['block/','bus/','class/','dev/','devices/','firmware/','fs/','kernel/','module/','power/'],
'/tmp': ['.ICE-unix/','.Test-unix/','.X11-unix/','.XIM-unix/','cache/','snap-private-tmp/','systemd-private-abc/','tmux-0/','vmware-root/'],
'/usr': ['bin/','games/','include/','lib/','lib32/','lib64/','libexec/','local/','sbin/','share/','src/'],
'/usr/bin': ['awk','curl','docker','gcc','g++','git','gpg','gzip','htop','java','jq','make','man','nano','nc','nmap','node','npm','npx','openssl','perl','pip3','python3','rsync','screen','sed','ssh','sudo','systemd-analyze','tail','tar','tee','tmux','top','tree','vim','wget','who','whoami','xargs','xxd','yq','zip'],
'/usr/local': ['bin/','etc/','games/','include/','lib/','man/','sbin/','share/','src/'],
'/usr/local/bin': ['docker-compose','kubectl','node','npm','npx','pip3','python3','yarn'],
'/usr/sbin': ['adduser','arp','deluser','dhclient','groupadd','groupdel','groupmod','ifconfig','iptables','named','sshd','tcpdump','useradd','userdel','usermod'],
'/usr/share': ['bash-completion/','ca-certificates/','dbus-1/','doc/','fonts/','icons/','info/','man/','misc/','terminfo/','themes/','vim/','zoneinfo/'],
'/var': ['backups/','cache/','crash/','lib/','local/','lock/','log/','mail/','opt/','run/','spool/','tmp/','www/'],
'/var/log': ['alternatives.log','alternatives.log.1','apt/','auth.log','auth.log.1','bootstrap.log','btmp','daemon.log','debug','dmesg','dmesg.0','dpkg.log','dpkg.log.1','faillog','journal/','kern.log','kern.log.1','lastlog','messages','mysql/','nginx/','syslog','syslog.1','unattended-upgrades/','wtmp'],
'/var/log/nginx': ['access.log','access.log.1','error.log','error.log.1'],
'/var/log/mysql': ['error.log'],
'/var/www': ['html/'],
'/var/www/html': ['404.html','50x.html','app.js','assets/','favicon.ico','index.html','robots.txt','style.css'],
'/var/backups': ['apt.extended_states.0','dpkg.status.0'],
'/var/spool': ['cron/','mail/'],
}

// File content map — keyed by full path
export const FILE_CONTENT: Record<string, string> = {
  '/etc/hostname': 'demo-server',
  '/etc/hosts': '127.0.0.1\tlocalhost\n127.0.1.1\tdemo-server\n192.168.1.100\tweb\n192.168.1.101\tdb\n\n::1\tlocalhost ip6-localhost ip6-loopback\n',
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nsys:x:3:3:sys:/dev:/usr/sbin/nologin\nadmin:x:1000:1000::/home/admin:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n',
  '/etc/group': 'root:x:0:\ndaemon:x:1:\nadmin:x:1000:\nwww-data:x:33:\ndocker:x:999:\n',
  '/etc/fstab': '# /etc/fstab: static file system information\nUUID=abc-123  /        ext4  defaults  0  1\nUUID=def-456  /data    ext4  defaults  0  2\n/swapfile     none     swap  sw        0  0\ntmpfs         /dev/shm tmpfs  defaults  0  0\n',
  '/etc/resolv.conf': '# Generated by NetworkManager\nnameserver 8.8.8.8\nnameserver 8.8.4.4\nsearch local\n',
  '/etc/os-release': 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\nSUPPORT_URL="https://help.ubuntu.com/"\nBUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"\n',
  '/etc/profile': '# /etc/profile: system-wide .profile\nif [ "$(id -u)" -eq 0 ]; then\n  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nelse\n  PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"\nfi\nexport PATH\numask 022\n',
  '/etc/crontab': '# /etc/crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n17 * * * * root cd / && run-parts --report /etc/cron.hourly\n25 6 * * * root test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )\n47 6 * * 7 root test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )\n52 6 1 * * root test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )\n',
  '/etc/ssh/sshd_config': '# sshd_config\nPort 22\nProtocol 2\nHostKey /etc/ssh/ssh_host_rsa_key\nHostKey /etc/ssh/ssh_host_ecdsa_key\nHostKey /etc/ssh/ssh_host_ed25519_key\nPermitRootLogin yes\nPubkeyAuthentication yes\nPasswordAuthentication yes\nChallengeResponseAuthentication no\nUsePAM yes\nX11Forwarding no\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem sftp /usr/lib/openssh/sftp-server\n',
  '/etc/ssh/ssh_config': 'Host *\n  SendEnv LANG LC_*\n  HashKnownHosts yes\n  GSSAPIAuthentication yes\n  ForwardAgent no\n',
  '/etc/nginx/nginx.conf': 'user www-data;\nworker_processes auto;\npid /run/nginx.pid;\nerror_log /var/log/nginx/error.log;\n\nevents {\n  worker_connections 768;\n  multi_accept on;\n  use epoll;\n}\n\nhttp {\n  sendfile on;\n  tcp_nopush on;\n  types_hash_max_size 2048;\n  server_tokens off;\n  include /etc/nginx/mime.types;\n  default_type application/octet-stream;\n  access_log /var/log/nginx/access.log;\n  error_log /var/log/nginx/error.log;\n  gzip on;\n  gzip_vary on;\n  gzip_types text/plain text/css application/json application/javascript;\n  include /etc/nginx/conf.d/*.conf;\n  include /etc/nginx/sites-enabled/*;\n}\n',
  '/proc/cpuinfo': 'processor\t: 0\nvendor_id\t: GenuineIntel\ncpu family\t: 6\nmodel\t\t: 85\nmodel name\t: Intel(R) Xeon(R) Platinum 8269CY CPU @ 2.50GHz\nstepping\t: 7\nmicrocode\t: 0x1\ncpu MHz\t\t: 2500.000\ncache size\t: 36608 KB\nphysical id\t: 0\nsiblings\t: 4\ncore id\t\t: 0\ncpu cores\t: 2\napicid\t\t: 0\n\nprocessor\t: 1\nvendor_id\t: GenuineIntel\ncpu family\t: 6\nmodel\t\t: 85\nmodel name\t: Intel(R) Xeon(R) Platinum 8269CY CPU @ 2.50GHz\nstepping\t: 7\nmicrocode\t: 0x1\ncpu MHz\t\t: 2500.000\ncache size\t: 36608 KB\n',
  '/proc/meminfo': 'MemTotal:        8192000 kB\nMemFree:         3200000 kB\nMemAvailable:    5200000 kB\nBuffers:          256000 kB\nCached:          1536000 kB\nSwapCached:            0 kB\nActive:          2048000 kB\nInactive:        1024000 kB\nSwapTotal:       2048000 kB\nSwapFree:        2048000 kB\nDirty:               128 kB\nWriteback:             0 kB\n',
  '/proc/uptime': '2592000.00 5184000.00',
  '/proc/loadavg': '0.10 0.05 0.01 1/256 12600',
  '/root/.ssh/config': 'Host github.com\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_ed25519\n\nHost prod\n  HostName 8.152.205.112\n  User root\n  Port 22\n',
  '/root/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGx... root@admin\n',
  '/root/app/config.json': '{\n  "name": "demo-app",\n  "version": "1.0.0",\n  "port": 8080,\n  "host": "0.0.0.0",\n  "debug": false,\n  "logLevel": "info",\n  "database": {\n    "host": "localhost",\n    "port": 5432,\n    "name": "demo",\n    "pool": { "min": 2, "max": 10 }\n  },\n  "redis": { "host": "localhost", "port": 6379 }\n}',
  '/root/app/main.js': 'const express = require("express");\nconst { Pool } = require("pg");\nconst config = require("./config.json");\n\nconst app = express();\napp.use(express.json());\n\nconst pool = new Pool(config.database);\n\napp.get("/", async (req, res) => {\n  try {\n    const { rows } = await pool.query("SELECT NOW()");\n    res.json({ status: "ok", time: rows[0].now, uptime: process.uptime() });\n  } catch (err) {\n    res.status(500).json({ error: err.message });\n  }\n});\n\napp.get("/health", (req, res) => res.json({ status: "healthy" }));\n\nconst PORT = config.port || 8080;\napp.listen(PORT, () => console.log("Listening on", PORT));',
  '/root/app/package.json': '{\n  "name": "demo-app",\n  "version": "1.0.0",\n  "description": "Demo application",\n  "main": "src/index.js",\n  "scripts": {\n    "start": "node src/index.js",\n    "dev": "nodemon src/index.js",\n    "test": "jest",\n    "build": "webpack --mode production"\n  },\n  "dependencies": {\n    "express": "^4.18.2",\n    "pg": "^8.11.3",\n    "redis": "^4.6.12",\n    "dotenv": "^16.3.1",\n    "cors": "^2.8.5",\n    "helmet": "^7.1.0",\n    "morgan": "^1.10.0"\n  },\n  "devDependencies": {\n    "nodemon": "^3.0.2",\n    "jest": "^29.7.0",\n    "supertest": "^6.3.3"\n  }\n}',
  '/root/docker-compose.yml': 'version: "3.8"\n\nservices:\n  app:\n    build: ./app\n    ports:\n      - "8080:8080"\n    environment:\n      - NODE_ENV=production\n      - DATABASE_URL=postgres://postgres:secret@db:5432/demo\n    volumes:\n      - ./app:/usr/src/app\n      - app-logs:/var/log/app\n    restart: unless-stopped\n    depends_on:\n      - db\n      - redis\n\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: demo\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"\n    volumes:\n      - redis-data:/data\n\n  nginx:\n    image: nginx:latest\n    ports:\n      - "80:80"\n      - "443:443"\n    volumes:\n      - ./nginx.conf:/etc/nginx/nginx.conf\n      - ./ssl:/etc/nginx/ssl\n    depends_on:\n      - app\n\nvolumes:\n  pgdata:\n  redis-data:\n  app-logs:',
  '/root/Dockerfile': 'FROM node:20-alpine\n\nWORKDIR /usr/src/app\n\nCOPY package*.json ./\nRUN npm ci --only=production\n\nCOPY . .\n\nEXPOSE 8080\n\nUSER node\n\nHEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/health || exit 1\n\nCMD ["node", "src/index.js"]',
  '/root/deploy.sh': '#!/bin/bash\nset -euo pipefail\n\necho "=== Deploying demo-app ===="\ncd /root/app\n\necho "Pulling changes..."\ngit pull origin main\n\necho "Installing dependencies..."\nnpm ci --production\n\necho "Restarting service..."\npm2 restart app || pm2 start src/index.js --name app\n\necho "=== Deploy complete ===="\n',
  '/root/README.md': '# Demo Server\n\nProduction server for hosting the demo application.\n\n## Services\n- **nginx**: Reverse proxy (ports 80/443)\n- **app**: Node.js API server (port 8080)\n- **db**: PostgreSQL 16\n- **redis**: Redis 7 cache\n- **sshd**: SSH remote access (port 22)\n\n## Quick Start\n```bash\ncd /root/app\nnpm start\n```\n\n## Logs\n```bash\ntail -f /root/logs/app.log\n```\n\n## Monitoring\n```bash\n./monitor.sh\n```',
  '/root/monitor.sh': '#!/bin/bash\n# System monitoring script\necho "=== System Monitor ==="\necho "CPU: $(top -bn1 | grep load | awk \'{printf "%.2f", $(NF-2)}\')"\necho "Memory: $(free -h | grep Mem | awk \'{print $3"/"$2}\')"\necho "Disk: $(df -h / | tail -1 | awk \'{print $3"/"$2 " ("$5")"}\')"\necho "Uptime: $(uptime -p)"\necho "Docker: $(docker ps -q | wc -l) containers running"',
  '/root/logs/app.log': '[2026-06-08 10:00:00] INFO  Server started on port 8080\n[2026-06-08 10:00:01] INFO  Database pool created (min:2, max:10)\n[2026-06-08 10:00:02] INFO  Redis connected\n[2026-06-08 10:00:03] INFO  All services healthy\n[2026-06-08 10:01:00] INFO  GET / 200 15ms\n[2026-06-08 10:01:30] INFO  GET /health 200 2ms\n[2026-06-08 10:02:00] INFO  GET /api/products 200 45ms\n[2026-06-08 10:02:30] INFO  POST /api/orders 201 120ms\n[2026-06-08 10:03:00] WARN  Slow query detected (250ms): SELECT * FROM orders WHERE...\n[2026-06-08 10:04:00] ERROR Connection refused to redis://localhost:6379 (retrying...)',
  '/root/logs/error.log': '[2026-06-08 10:04:00] ERROR Unhandled rejection: ECONNREFUSED ::1:6379\n[2026-06-08 10:04:01] ERROR Redis reconnect attempt 1 failed\n[2026-06-08 10:04:02] WARN  Memory usage above 80% threshold (current: 82.3%)\n[2026-06-08 10:04:03] INFO  Redis reconnected successfully\n[2026-06-08 10:05:00] ERROR POST /api/orders 500 120ms - duplicate key violation on orders_pkey',
  '/root/notes.txt': 'TODO:\n- Update SSL certificate before July 15\n- Migrate database to new cluster\n- Review firewall rules for port 8080\n- Set up monitoring alerts for disk > 80%\n- Configure automatic backups for /root/data\n- Upgrade Node.js to v22 LTS\n- Clean up old Docker images (> 30 days)\n- Document deployment process for new team members',
  '/root/todo.md': '# TODO\n\n## Urgent\n- [ ] Fix memory leak in API server\n- [ ] Apply security patches\n\n## This Week\n- [ ] Add rate limiting to /api endpoints\n- [ ] Set up CI/CD pipeline\n- [ ] Write integration tests for order flow\n\n## Later\n- [ ] Migrate from express to fastify\n- [ ] Set up Kubernetes cluster',
  '/root/install.sh': '#!/bin/bash\n# Installation script for demo server\nset -e\n\necho "Installing dependencies..."\napt update && apt install -y nodejs npm postgresql redis nginx\n\necho "Setting up app..."\ncd /root/app\nnpm install\n\necho "Configuring services..."\nsystemctl enable nginx docker postgresql\nsystemctl start nginx docker postgresql\n\necho "Installation complete!"',
  '/var/log/syslog': 'Jun  8 10:00:00 demo-server systemd[1]: Started Session 1 of user root.\nJun  8 10:00:01 demo-server CRON[1234]: (root) CMD (run-parts /etc/cron.hourly)\nJun  8 10:00:05 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100\nJun  8 10:00:06 demo-server systemd[1]: Created slice User Slice of root.\nJun  8 10:01:00 demo-server nginx[512]: 192.168.1.1 - "GET / HTTP/1.1" 200\nJun  8 10:02:00 demo-server dockerd[1024]: Container app restarted (exit code 0)',
  '/var/log/auth.log': 'Jun  8 09:55:00 demo-server sshd[256]: Server listening on 0.0.0.0 port 22\nJun  8 09:55:05 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100\nJun  8 09:55:05 demo-server sshd[256]: pam_unix(sshd:session): session opened for user root\nJun  8 10:00:00 demo-server sudo: root : TTY=pts/0 ; PWD=/root ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx',
  '/var/www/html/index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Welcome</title>\n  <style>\n    body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f5f5f5; }\n    h1 { color:#333; }\n  </style>\n</head>\n<body>\n  <h1>Welcome to Demo Server</h1>\n</body>\n</html>',
  '/home/admin/projects/webapp/package.json': '{\n  "name": "webapp",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vue-tsc && vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "vue": "^3.5.0",\n    "pinia": "^2.2.0",\n    "vue-router": "^4.4.0",\n    "axios": "^1.7.0"\n  },\n  "devDependencies": {\n    "@vitejs/plugin-vue": "^5.2.0",\n    "typescript": "^5.6.0",\n    "vite": "^6.0.0",\n    "vue-tsc": "^2.2.0"\n  }\n}',
  '/home/admin/projects/api-server/main.py': '"""API Server - FastAPI Application"""\n\nfrom fastapi import FastAPI, HTTPException\nfrom fastapi.middleware.cors import CORSMiddleware\nimport uvicorn\nfrom datetime import datetime\n\napp = FastAPI(title="Demo API", version="1.0.0")\n\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_methods=["*"],\n    allow_headers=["*"],\n)\n\n@app.get("/")\nasync def root():\n    return {"status": "ok", "service": "demo-api", "time": datetime.now().isoformat()}\n\n@app.get("/health")\nasync def health():\n    return {"status": "healthy"}\n\n@app.get("/items/{item_id}")\nasync def get_item(item_id: int):\n    if item_id <= 0:\n        raise HTTPException(status_code=404, detail="Item not found")\n    return {"id": item_id, "name": f"Item {item_id}"}\n\nif __name__ == "__main__":\n    uvicorn.run(app, host="0.0.0.0", port=8000)',
  '/home/admin/projects/api-server/requirements.txt': 'fastapi==0.109.0\nuvicorn[standard]==0.27.0\nsqlalchemy==2.0.25\npsycopg2-binary==2.9.9\npython-jose[cryptography]==3.3.0\npasslib[bcrypt]==1.7.4\npython-multipart==0.0.6\nalembic==1.13.1\npydantic[email]==2.5.3',
  '/home/admin/scripts/deploy.sh': '#!/bin/bash\nset -e\necho "Deploying webapp..."\ncd /home/admin/projects/webapp\ngit pull origin main\nnpm ci\nnpm run build\nsudo systemctl restart webapp\necho "Deploy complete."',
  '/home/admin/scripts/backup.sh': '#!/bin/bash\nDATE=$(date +%Y%m%d)\nBACKUP_DIR="/home/admin/backups"\nmkdir -p "$BACKUP_DIR"\ntar -czf "$BACKUP_DIR/backup-$DATE.tar.gz" /home/admin/projects /home/admin/scripts\necho "Backup created: backup-$DATE.tar.gz"\nfind "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +30 -delete',
  '/home/admin/scripts/healthcheck.sh': '#!/bin/bash\n# Health check script\nFAIL=0\ncurl -sf http://localhost:8080/health > /dev/null || FAIL=1\ncurl -sf http://localhost:80/ > /dev/null || FAIL=2\nif [ $FAIL -ne 0 ]; then\n  echo "Health check failed (code: $FAIL)"\n  exit 1\nfi\necho "All services OK"',
}

// Helper: check if path is a directory (explicit entry OR listed in parent as dir/)
export function isDir(path: string): boolean {
  if (path in FS) return true
  // Check if listed as directory in parent
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash < 0) return false
  const parent = path === '/' ? '/' : path.substring(0, lastSlash) || '/'
  const name = path.substring(lastSlash + 1)
  const siblings = FS[parent]
  if (siblings && siblings.includes(name + '/')) return true
  // Recursively check: any FS key that starts with this path means it's a directory
  const prefix = path + '/'
  for (const key of Object.keys(FS)) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

// Helper: get directory contents — auto-generates for directories without explicit entries
export function dirContents(path: string): string[] {
  const explicit = FS[path]
  if (explicit) return explicit
  if (!isDir(path)) return []
  // Auto-generate: search all FS entries for immediate children
  const prefix = path === '/' ? '/' : path + '/'
  const children: string[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(FS)) {
    if (key === path) continue
    if (!key.startsWith(prefix)) continue
    const rest = key.substring(prefix.length)
    const firstPart = rest.split('/')[0]
    if (!seen.has(firstPart)) {
      seen.add(firstPart)
      const childPath = prefix + firstPart
      children.push(isDir(childPath) ? firstPart + '/' : firstPart)
    }
  }
  return children
}

// Helper: check if name is hidden
export function isHidden(name: string): boolean { return name.startsWith('.') }

// Helper: get file content
export function getContent(fp: string): string | null {
  if (fp in FILE_CONTENT) return FILE_CONTENT[fp]
  if (isDir(fp)) return null
  const name = fp.split('/').pop() || ''
  const ext = name.includes('.') ? (name.split('.').pop() || '').toLowerCase() : ''
  if (['gz','tgz','zip','bz2','xz','rar','7z','png','jpg','jpeg','gif','svg','ico','webp','bmp','mp3','mp4','ttf','woff','tar.gz'].includes(ext)||name.includes('.tar.')) return `[Binary: ${name}]`
  if (ext==='json') return `{\n  "file": "${name}",\n  "path": "${fp}"\n}`
  if (ext==='yml'||ext==='yaml') return `# ${name}\nfile: ${fp}`
  if (ext==='conf'||ext==='cfg'||ext==='ini') return `# ${name}\nkey = value`
  if (ext==='sh'||ext==='bash') return `#!/bin/bash\n# ${name}\necho "Hello"`
  if (ext==='py') return `"""${name}"""\nprint("Hello")`
  if (ext==='js') return `// ${name}\nconsole.log("Hello");`
  if (ext==='ts') return `// ${name}\nconst x: string = "Hello";`
  if (ext==='html') return `<!DOCTYPE html>\n<html><body><h1>Hello</h1></body></html>`
  if (ext==='css'||ext==='scss') return `/* ${name} */\nbody{margin:0}`
  if (ext==='md') return `# ${name.replace('.md','')}\nContent of ${fp}.`
  if (ext==='log') return `[2026-06-08 10:00:00] INFO  ${name}`
  if (ext==='txt') return `Content of ${fp}`
  if (ext==='csv') return `id,name,value\n1,item1,100\n2,item2,200\n3,item3,300`
  if (ext==='xml') return `<?xml version="1.0"?>\n<root><item>value</item></root>`
  if (ext==='sql') return `-- ${name}\nSELECT 1;`
  if (ext==='pub') return `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...`
  if (ext==='toml') return `# ${name}\n[section]\nkey = "value"`
  if (ext==='service') return `[Unit]\nDescription=${name}\n[Service]\nExecStart=/usr/bin/${name}\n[Install]\nWantedBy=multi-user.target`
  return `[${fp}]`
}
