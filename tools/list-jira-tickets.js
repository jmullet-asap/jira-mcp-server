import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  throw new Error("Missing JIRA_EMAIL or JIRA_TOKEN in .env");
}

const jiraApi = axios.create({
  baseURL: "https://asaptire.atlassian.net",
  auth: {
    username: JIRA_EMAIL,
    password: JIRA_TOKEN,
  },
  headers: {
    Accept: "application/json",
  },
});

/**
 * List JIRA tickets with smart filtering
 * @param {Object} options
 * @param {string} options.project - Project key (e.g., "TRACI")
 * @param {string} [options.assignee] - Filter by assignee: "me" | "unassigned" | "all" | email
 * @param {string} [options.status] - Filter by status (e.g., "To Do", "In Progress", "Done")
 * @param {string} [options.orderBy] - Sort order: "rank" (board order) | "created" | "updated" | "priority"
 * @param {number} [options.maxResults] - Maximum results to return (default: 50)
 */
export async function listJiraTickets({
  project,
  assignee = "all",
  status = null,
  orderBy = "rank",
  maxResults = 50,
}) {
  try {
    // Build JQL query
    let jqlParts = [`project = ${project}`];

    // Handle assignee filter
    if (assignee === "me") {
      jqlParts.push("assignee = currentUser()");
    } else if (assignee === "unassigned") {
      jqlParts.push("assignee is EMPTY");
    } else if (assignee !== "all") {
      // Specific email
      jqlParts.push(`assignee = "${assignee}"`);
    }

    // Handle status filter
    if (status) {
      jqlParts.push(`status = "${status}"`);
    }

    // Handle ordering
    let orderClause;
    switch (orderBy) {
      case "rank":
        orderClause = "ORDER BY Rank ASC";
        break;
      case "created":
        orderClause = "ORDER BY created DESC";
        break;
      case "updated":
        orderClause = "ORDER BY updated DESC";
        break;
      case "priority":
        orderClause = "ORDER BY priority DESC, created DESC";
        break;
      default:
        orderClause = "ORDER BY Rank ASC";
    }

    const jql = `${jqlParts.join(" AND ")} ${orderClause}`;
    const encoded = encodeURIComponent(jql);

    // Fetch tickets
    const response = await jiraApi.get(
      `/rest/api/3/search/jql?jql=${encoded}&maxResults=${maxResults}&fields=key,summary,status,assignee,priority,created,updated,issuetype`
    );

    const tickets = response.data.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName || "Unassigned",
      assigneeEmail: issue.fields.assignee?.emailAddress || null,
      priority: issue.fields.priority?.name || "None",
      type: issue.fields.issuetype.name,
      created: issue.fields.created,
      updated: issue.fields.updated,
    }));

    return {
      total: response.data.total || tickets.length,
      tickets,
      query: jql,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch JIRA tickets: ${error.response?.data?.errorMessages?.join(", ") || error.message}`
    );
  }
}
