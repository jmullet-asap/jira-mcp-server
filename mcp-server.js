#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from the same directory as this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createJiraTicket } from './tools/create-jira-ticket.js';
import { readJiraTicket } from './tools/read-jira-ticket.js';
import { updateJiraTicket } from './tools/update-jira-ticket.js';
import { listJiraTickets } from './tools/list-jira-tickets.js';

const server = new Server(
  {
    name: 'jira-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_ticket',
        description: 'Create JIRA tickets in any project (FRON, TRAC, DTMI, INN). Supports project aliases: FRON = ASAP Fork = TRMI = mobile install. Claude should parse user brain dumps into clean title/current/desired before calling. Shows preview before creating. Natural language examples: "create ticket about login bug in TRAC", "make a DTMI ticket for the dashboard issue", "create TRACI ticket for SES setup".',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Ticket title with [PROJECT] prefix (e.g., "[DTMI] Enable user management in portal")',
            },
            current: {
              type: 'string',
              description: 'Current state - what is broken or manual now',
            },
            desired: {
              type: 'string',
              description: 'Desired state - what should happen instead',
            },
            project: {
              type: 'string',
              description: 'JIRA project key or alias. Examples: "TRAC" or "TRACI" for TRACI project, "FRON" or "ASAP Fork" or "TRMI" or "mobile install" for FRON project, "DTMI" for DTMI project, "INN" or "innovation" for Innovation project. Defaults to "FRON" if not specified.',
              default: 'FRON',
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels for the ticket (e.g., ["DTMI", "Backend"])',
            },
            issueType: {
              type: 'string',
              description: 'Issue type: "Task" or "Bug". Defaults to "Task".',
              enum: ['Task', 'Bug'],
              default: 'Task',
            },
            confirm: {
              type: 'boolean',
              description: 'Set to true ONLY after showing preview and getting user confirmation. NEVER set to true on first call.',
              default: false,
            },
          },
          required: ['title', 'current', 'desired'],
        },
      },
      {
        name: 'read_ticket',
        description: 'Read and display a JIRA ticket with all details including description, status, comments, and metadata. Use this to fetch existing tickets by their key (e.g., FRON-1151). Natural language examples: "read ticket FRON-1151", "show me issue DTMI-456", "get ticket details for TRIC-789".',
        inputSchema: {
          type: 'object',
          properties: {
            ticketKey: {
              type: 'string',
              description: 'JIRA ticket key in format PROJECT-NUMBER (e.g., FRON-1151)',
            },
          },
          required: ['ticketKey'],
        },
      },
      {
        name: 'update_ticket',
        description: 'Update an existing JIRA ticket. Can modify summary, append to description, replace description, or update labels. Use this to add information to existing tickets. Natural language examples: "update FRON-1550 with new details", "add LavaMoat info to ticket 1550", "append testing plan to FRON-1234".',
        inputSchema: {
          type: 'object',
          properties: {
            ticketKey: {
              type: 'string',
              description: 'JIRA ticket key in format PROJECT-NUMBER (e.g., FRON-1550)',
            },
            summary: {
              type: 'string',
              description: 'New summary/title for the ticket (optional)',
            },
            appendDescription: {
              type: 'string',
              description: 'Text to append to the existing description. Will be added after a horizontal rule separator.',
            },
            replaceDescription: {
              type: 'string',
              description: 'Text to completely replace the description. Use appendDescription instead if you want to add to existing content.',
            },
            addLabels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to add to the ticket (e.g., ["LavaMoat", "Security"])',
            },
            removeLabels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to remove from the ticket',
            },
          },
          required: ['ticketKey'],
        },
      },
      {
        name: 'list_tickets',
        description: 'Browse and list JIRA tickets with smart filtering. Can show all tickets, filter by assignee (including "my tickets"), status, and maintain board order. Natural language examples: "list all TRACI tickets", "show me my TRACI tickets", "list TRAC tickets assigned to me", "show unassigned tickets", "list tickets in To Do status".',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project key (e.g., "TRACI", "FRON", "DTMI")',
            },
            assignee: {
              type: 'string',
              description: 'Filter by assignee: "me" (current user), "unassigned", "all" (no filter), or specific email address. Defaults to "all".',
              enum: ['me', 'unassigned', 'all'],
              default: 'all',
            },
            status: {
              type: 'string',
              description: 'Filter by status (e.g., "To Do", "In Progress", "Done", "BACKLOG", "TESTING"). Optional.',
            },
            orderBy: {
              type: 'string',
              description: 'Sort order: "rank" (board order, default), "created" (newest first), "updated" (recently updated first), "priority" (highest priority first).',
              enum: ['rank', 'created', 'updated', 'priority'],
              default: 'rank',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return. Defaults to 50.',
              default: 50,
            },
          },
          required: ['project'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'create_ticket') {
    const { title, current, desired, labels = [], issueType = 'Task', project = 'FRON', confirm = false } = args;

    try {
      // Build preview text
      const previewText = `📋 **JIRA Ticket Preview**

🎯 **Summary:** ${title}
📌 **Type:** ${issueType}
📂 **Project:** ${project}
🏷️ **Labels:** ${labels.length > 0 ? labels.join(', ') : 'None'}

📄 **Description:**

**Current**
${current}

**Desired**
${desired}

---`;

      if (!confirm) {
        // Preview mode - show formatted preview to user
        return {
          content: [
            {
              type: 'text',
              text: previewText,
            },
          ],
        };
      } else {
        // Actually create the ticket
        const result = await createJiraTicket({
          title,
          current,
          desired,
          labels,
          issueType,
          project
        });

        return {
          content: [
            {
              type: 'text',
              text: `${previewText}

✅ **JIRA Ticket Created Successfully!**

🎫 **Ticket:** ${result.key}
🔗 **URL:** ${result.url}

The ticket has been created in the ${result.key.split('-')[0]} project with your Current/Desired format.`,
            },
          ],
        };
      }

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error creating JIRA ticket:** ${error.message}

🔧 **This might help:**
- Check JIRA credentials in .env file
- Verify network connectivity to JIRA
- Ensure all required fields are provided`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'read_ticket') {
    const { ticketKey } = args;

    try {
      const ticket = await readJiraTicket(ticketKey);

      return {
        content: [
          {
            type: 'text',
            text: `🎫 **${ticket.key}: ${ticket.summary}**

📋 **Project:** ${ticket.project}
🔗 **URL:** ${ticket.url}
📊 **Status:** ${ticket.status}
🎯 **Type:** ${ticket.issueType}
⚡ **Priority:** ${ticket.priority}
👤 **Assignee:** ${ticket.assignee}
📝 **Reporter:** ${ticket.reporter}
📅 **Created:** ${ticket.created}
🔄 **Updated:** ${ticket.updated}
${ticket.labels.length > 0 ? `🏷️ **Labels:** ${ticket.labels.join(', ')}` : ''}
${ticket.components.length > 0 ? `🧩 **Components:** ${ticket.components.join(', ')}` : ''}
${ticket.fixVersions.length > 0 ? `🚀 **Fix Versions:** ${ticket.fixVersions.join(', ')}` : ''}

📄 **Description:**
${ticket.description || 'No description provided'}

${ticket.comments.length > 0 ? `💬 **Recent Comments:**
${ticket.comments.map(comment =>
  `**${comment.author}** (${comment.created}):
${comment.body}`
).join('\n\n---\n\n')}` : ''}`,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error reading JIRA ticket:** ${error.message}

🔧 **This might help:**
- Verify ticket key format (e.g., FRON-1151)
- Check JIRA credentials in .env file
- Ensure you have permission to view this ticket
- Verify network connectivity to JIRA`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'update_ticket') {
    const { ticketKey, summary, appendDescription, replaceDescription, addLabels, removeLabels } = args;

    try {
      const result = await updateJiraTicket({
        ticketKey,
        summary,
        appendDescription,
        replaceDescription,
        addLabels,
        removeLabels
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ **JIRA Ticket Updated Successfully!**

🎫 **Ticket:** ${result.key}
🔗 **URL:** ${result.url}
📝 **Updated Fields:** ${result.updated.join(', ')}

The ticket has been updated with your changes.`,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error updating JIRA ticket:** ${error.message}

🔧 **This might help:**
- Verify ticket key format (e.g., FRON-1550)
- Check JIRA credentials in .env file
- Ensure you have permission to edit this ticket
- Verify network connectivity to JIRA`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'list_tickets') {
    const { project, assignee = 'all', status = null, orderBy = 'rank', maxResults = 50 } = args;

    try {
      const result = await listJiraTickets({
        project,
        assignee,
        status,
        orderBy,
        maxResults
      });

      // Format tickets for display
      const ticketList = result.tickets.map((ticket, idx) => {
        return `${idx + 1}. **[${ticket.key}](https://asaptire.atlassian.net/browse/${ticket.key})** ${ticket.summary}
   👤 ${ticket.assignee} | 📊 ${ticket.status} | 🏷️ ${ticket.type}${ticket.priority !== 'None' ? ` | ⚡ ${ticket.priority}` : ''}`;
      }).join('\n\n');

      // Build filter description
      let filterDesc = `Project: ${project}`;
      if (assignee === 'me') filterDesc += ' | Assignee: You';
      else if (assignee === 'unassigned') filterDesc += ' | Assignee: Unassigned';
      else if (assignee !== 'all') filterDesc += ` | Assignee: ${assignee}`;
      if (status) filterDesc += ` | Status: ${status}`;
      filterDesc += ` | Order: ${orderBy}`;

      return {
        content: [
          {
            type: 'text',
            text: `📋 **JIRA Tickets**

🔍 **Filters:** ${filterDesc}
📊 **Results:** ${result.tickets.length} of ${result.total} tickets

${ticketList}

---
_JQL Query: \`${result.query}\`_`,
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Error listing JIRA tickets:** ${error.message}

🔧 **This might help:**
- Verify project key format (e.g., "TRACI", "FRON")
- Check JIRA credentials in .env file
- Ensure you have permission to view this project
- Verify network connectivity to JIRA`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jira MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
