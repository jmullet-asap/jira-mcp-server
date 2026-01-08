# Jira MCP Server

A Model Context Protocol (MCP) server that provides Jira ticket management tools for Claude Code. Create, read, update, and list Jira tickets directly from your Claude Code conversations.

## Features

- **Create Tickets**: Generate new Jira tickets with title, description, labels, and issue type
- **Read Tickets**: Fetch full ticket details including description, comments, and metadata
- **Update Tickets**: Modify ticket summaries, descriptions, and labels
- **List Tickets**: Browse and filter tickets by project, assignee, and status

## Prerequisites

- Node.js (v16 or higher)
- Claude Code CLI
- Jira account with API access

## Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd jira-mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and add your Jira credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
JIRA_EMAIL=your-email@company.com
JIRA_TOKEN=your_jira_api_token_here
```

#### Getting Your Jira API Token

1. Log in to Jira
2. Go to [Atlassian Account Security](https://id.atlassian.com/manage-profile/security/api-tokens)
3. Click "Create API token"
4. Give it a descriptive name (e.g., "Claude Code MCP")
5. Copy the generated token to your `.env` file

### 4. Make the Start Script Executable

```bash
chmod +x start-mcp-server.sh
```

### 5. Add to Claude Code Configuration

Edit your Claude Code configuration file at `~/.claude.json` and add the MCP server to the global `mcpServers` section:

```json
{
  "mcpServers": {
    "jira-mcp-server": {
      "type": "stdio",
      "command": "/absolute/path/to/jira-mcp-server/start-mcp-server.sh",
      "args": [],
      "env": {}
    }
  }
}
```

**Important**: Replace `/absolute/path/to/jira-mcp-server/` with the actual absolute path to your cloned repository.

### 6. Restart Claude Code

After updating the configuration, restart Claude Code to load the Jira MCP server.

## Usage

Once configured, you can use natural language in Claude Code to interact with Jira:

### Creating Tickets

```
Create a TRAC ticket about fixing the login bug.
Current state: Users can't log in with email
Desired state: Email login should work properly
```

### Reading Tickets

```
Read ticket TRAC-123
Show me the details for FRON-456
```

### Updating Tickets

```
Update TRAC-123 with new testing information
Add the "backend" label to ticket FRON-456
```

### Listing Tickets

```
List all TRAC tickets
Show me my assigned tickets in DTMI
List unassigned tickets in FRON
```

## Supported Projects

The server works with any Jira project. Common examples:
- **TRAC** (TRACI project)
- **FRON** (ASAP Fork / TRMI / Mobile Install project)
- **DTMI** (DTMI project)
- **INN** (Innovation project)

## Architecture

```
jira-mcp-server/
├── mcp-server.js           # Main MCP server implementation
├── start-mcp-server.sh     # Startup script
├── tools/                  # Tool implementations
│   ├── create-jira-ticket.js
│   ├── read-jira-ticket.js
│   ├── update-jira-ticket.js
│   └── list-jira-tickets.js
├── package.json
├── .env                    # Your credentials (gitignored)
├── .env.example            # Template for credentials
└── README.md
```

## Troubleshooting

### Server Not Loading

1. Check that the path in `~/.claude.json` is absolute and correct
2. Verify the start script is executable: `ls -l start-mcp-server.sh`
3. Test the server manually: `node mcp-server.js`
4. Check Claude Code logs for error messages

### Authentication Errors

1. Verify your `.env` file has correct credentials
2. Test your API token in Jira's API browser
3. Make sure your Jira account has appropriate permissions

### Missing JIRA_EMAIL or JIRA_TOKEN Error

1. Ensure `.env` file exists in the jira-mcp-server directory
2. Verify `.env` contains both `JIRA_EMAIL` and `JIRA_TOKEN`
3. Restart Claude Code after updating `.env`

## Security

- Never commit your `.env` file to version control
- Keep your Jira API token secure
- The `.gitignore` file is configured to exclude `.env`

## License

MIT

## Contributing

Issues and pull requests are welcome!
