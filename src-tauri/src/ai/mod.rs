//! AI module
//! Agent definitions and AI chat logic

use serde::{Deserialize, Serialize};

/// Agent definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub system_prompt: String,
}

/// Default agents
pub fn default_agents() -> Vec<Agent> {
    vec![
        Agent {
            id: "coder".to_string(),
            name: "Coder".to_string(),
            icon: "icon-code".to_string(),
            description: "Code generation, debugging, architecture".to_string(),
            system_prompt: "You are a senior programming expert.".to_string(),
        },
        Agent {
            id: "ops".to_string(),
            name: "Ops".to_string(),
            icon: "icon-wrench".to_string(),
            description: "Server management, deployment, monitoring".to_string(),
            system_prompt: "You are an experienced DevOps engineer.".to_string(),
        },
        Agent {
            id: "analyst".to_string(),
            name: "Analyst".to_string(),
            icon: "icon-chart".to_string(),
            description: "Data processing, visualization, statistics".to_string(),
            system_prompt: "You are a data analysis expert.".to_string(),
        },
        Agent {
            id: "assistant".to_string(),
            name: "Assistant".to_string(),
            icon: "icon-bot".to_string(),
            description: "Q&A, writing, translation, general tasks".to_string(),
            system_prompt: "You are a general AI assistant.".to_string(),
        },
    ]
}
