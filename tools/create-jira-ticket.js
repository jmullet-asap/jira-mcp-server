#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_EMAIL or JIRA_TOKEN in .env');
  process.exit(1);
}

function formatDescription(current, desired) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Current",
            marks: [{ type: "strong" }]
          }
        ]
      },
      {
        type: "paragraph", 
        content: [
          {
            type: "text",
            text: current
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text", 
            text: ""
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Desired",
            marks: [{ type: "strong" }]
          }
        ]
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: desired
          }
        ]
      }
    ]
  };
}

// Project key mapping for aliases
const PROJECT_ALIASES = {
  'FRON': 'FRON',
  'ASAP Fork': 'FRON',
  'ASAP FORK': 'FRON',
  'TRMI': 'FRON',
  'mobile': 'FRON',
  'mobile install': 'FRON',
  'TRAC': 'TRAC',
  'TRACI': 'TRAC',
  'DTMI': 'DTMI',
  'INN': 'INN',
  'innovation': 'INN'
};

function normalizeProjectKey(project) {
  const normalized = PROJECT_ALIASES[project];
  if (normalized) {
    return normalized;
  }

  // Try case-insensitive match
  const upperProject = project.toUpperCase();
  for (const [alias, key] of Object.entries(PROJECT_ALIASES)) {
    if (alias.toUpperCase() === upperProject) {
      return key;
    }
  }

  // If no match, assume it's already a valid project key and return uppercase
  return upperProject;
}

async function createJiraTicket({ title, current, desired, labels = [], issueType = 'Task', project = 'FRON' }) {
  try {
    const projectKey = normalizeProjectKey(project);
    console.log(`🎫 Creating JIRA ticket in ${projectKey} project...`);

    const response = await axios.post(
      'https://asaptire.atlassian.net/rest/api/3/issue',
      {
        fields: {
          project: { key: projectKey },
          summary: title,
          description: formatDescription(current, desired),
          issuetype: { name: issueType },
          labels: labels
        }
      },
      {
        auth: {
          username: JIRA_EMAIL,
          password: JIRA_TOKEN,
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      }
    );

    const ticketKey = response.data.key;
    const ticketUrl = `https://asaptire.atlassian.net/browse/${ticketKey}`;

    console.log(`✅ Created JIRA ticket: ${ticketKey}`);
    console.log(`🔗 URL: ${ticketUrl}`);

    return {
      key: ticketKey,
      id: response.data.id,
      url: ticketUrl,
      self: response.data.self
    };

  } catch (error) {
    console.error('❌ Error creating JIRA ticket:', error.response?.data || error.message);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  // Expect JSON input with explicit fields
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node create-jira-ticket.js <JSON>');
    console.error('Example: node create-jira-ticket.js \'{"title":"[DTMI] Fix login", "current":"Login broken", "desired":"Login should work", "labels":["DTMI"]}\'');
    process.exit(1);
  }

  try {
    const ticketData = JSON.parse(args.join(' '));

    console.log('\n📋 Ticket Preview:');
    console.log('==================');
    console.log(`Title: ${ticketData.title}`);
    console.log(`Type: ${ticketData.issueType || 'Task'}`);
    console.log(`Labels: ${ticketData.labels?.join(', ') || 'None'}`);
    console.log('\nDescription:');
    console.log(`**Current**\n${ticketData.current}\n\n**Desired**\n${ticketData.desired}`);
    console.log('==================\n');

    createJiraTicket(ticketData)
      .then(result => {
        console.log(`🎉 Ticket created successfully: ${result.key}`);
      })
      .catch(error => {
        console.error('💥 Failed to create ticket');
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Invalid JSON input');
    console.error(error.message);
    process.exit(1);
  }
}

export { createJiraTicket };