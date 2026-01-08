#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error('Missing JIRA_EMAIL or JIRA_TOKEN in .env');
  process.exit(1);
}

const JIRA_BASE_URL = 'https://asaptire.atlassian.net';

// Create axios instance with auth
const jiraApi = axios.create({
  baseURL: JIRA_BASE_URL,
  auth: {
    username: JIRA_EMAIL,
    password: JIRA_TOKEN
  },
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

function formatDescriptionADF(text) {
  // Convert plain text with markdown-like formatting to ADF
  const lines = text.split('\n');
  const content = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines (fixes double newline issue)
    if (!line.trim()) {
      i++;
      continue;
    }

    // Handle markdown headers (### text, ## text, # text)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];
      content.push({
        type: "heading",
        attrs: { level: level },
        content: [{ type: "text", text: headerText }]
      });
      i++;
      continue;
    }

    // Handle numbered lists
    if (line.match(/^\d+\.\s/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        const itemText = lines[i].replace(/^\d+\.\s/, '');
        listItems.push({
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: itemText }]
          }]
        });
        i++;
      }
      content.push({
        type: "orderedList",
        content: listItems
      });
      continue;
    }

    // Handle bullet lists
    if (line.match(/^[-*]\s/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        const itemText = lines[i].replace(/^[-*]\s/, '');
        listItems.push({
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: itemText }]
          }]
        });
        i++;
      }
      content.push({
        type: "bulletList",
        content: listItems
      });
      continue;
    }

    // Handle bold headers (**text**)
    if (line.match(/^\*\*.*\*\*$/)) {
      const headerText = line.replace(/^\*\*/, '').replace(/\*\*$/, '');
      content.push({
        type: "paragraph",
        content: [{
          type: "text",
          text: headerText,
          marks: [{ type: "strong" }]
        }]
      });
      i++;
      continue;
    }

    // Regular paragraph
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: line }]
    });
    i++;
  }

  return {
    type: "doc",
    version: 1,
    content: content
  };
}

async function getTicket(ticketKey) {
  const response = await jiraApi.get(`/rest/api/3/issue/${ticketKey}`);
  return response.data;
}

async function updateJiraTicket({ ticketKey, summary, appendDescription, replaceDescription, addLabels, removeLabels }) {
  try {
    // Validate ticket key format
    if (!ticketKey || !ticketKey.match(/^[A-Z]+-\d+$/)) {
      throw new Error(`Invalid ticket key format: ${ticketKey}. Expected format: PROJECT-123`);
    }

    console.log(`🔄 Updating JIRA ticket: ${ticketKey}...`);

    // Build the update payload
    const updatePayload = { fields: {}, update: {} };

    // Update summary if provided
    if (summary) {
      updatePayload.fields.summary = summary;
    }

    // Handle description updates (use "update" with "set" for ADF, not "fields")
    if (replaceDescription) {
      updatePayload.update.description = [{
        set: formatDescriptionADF(replaceDescription)
      }];
    } else if (appendDescription) {
      // Fetch current description first
      const currentTicket = await getTicket(ticketKey);
      const currentDesc = currentTicket.fields.description;

      // Build new description by appending
      let newDescContent = [];
      if (currentDesc && currentDesc.content) {
        newDescContent = [...currentDesc.content];
      }

      // Add separator
      newDescContent.push({
        type: "paragraph",
        content: [{ type: "text", text: "" }]
      });
      newDescContent.push({
        type: "rule"
      });
      newDescContent.push({
        type: "paragraph",
        content: [{ type: "text", text: "" }]
      });

      // Add new content
      const appendedADF = formatDescriptionADF(appendDescription);
      newDescContent.push(...appendedADF.content);

      updatePayload.update.description = [{
        set: {
          type: "doc",
          version: 1,
          content: newDescContent
        }
      }];
    }

    // Handle label updates
    if (addLabels || removeLabels) {
      const currentTicket = await getTicket(ticketKey);
      let currentLabels = currentTicket.fields.labels || [];

      if (addLabels) {
        currentLabels = [...new Set([...currentLabels, ...addLabels])];
      }

      if (removeLabels) {
        currentLabels = currentLabels.filter(l => !removeLabels.includes(l));
      }

      updatePayload.fields.labels = currentLabels;
    }

    // Only make API call if there are updates
    const hasFieldsUpdate = Object.keys(updatePayload.fields).length > 0;
    const hasUpdateOps = Object.keys(updatePayload.update).length > 0;

    if (!hasFieldsUpdate && !hasUpdateOps) {
      throw new Error('No updates specified. Provide summary, appendDescription, replaceDescription, addLabels, or removeLabels.');
    }

    // Clean up empty objects
    if (!hasFieldsUpdate) delete updatePayload.fields;
    if (!hasUpdateOps) delete updatePayload.update;

    await jiraApi.put(`/rest/api/3/issue/${ticketKey}`, updatePayload);

    const ticketUrl = `${JIRA_BASE_URL}/browse/${ticketKey}`;

    console.log(`✅ Updated JIRA ticket: ${ticketKey}`);
    console.log(`🔗 URL: ${ticketUrl}`);

    const updatedFields = [...Object.keys(updatePayload.fields || {}), ...Object.keys(updatePayload.update || {})];

    return {
      key: ticketKey,
      url: ticketUrl,
      updated: updatedFields
    };

  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Ticket ${ticketKey} not found.`);
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Check your JIRA_EMAIL and JIRA_TOKEN.');
    } else if (error.response?.status === 403) {
      throw new Error(`Access denied to ticket ${ticketKey}. Check your permissions.`);
    }
    console.error('❌ Error updating JIRA ticket:', error.response?.data || error.message);
    throw error;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node update-jira-ticket.js <JSON>');
    console.error('Example: node update-jira-ticket.js \'{"ticketKey":"FRON-1550", "appendDescription":"New info to add"}\'');
    process.exit(1);
  }

  try {
    const updateData = JSON.parse(args.join(' '));

    updateJiraTicket(updateData)
      .then(result => {
        console.log(`🎉 Ticket updated successfully: ${result.key}`);
        console.log(`📝 Updated fields: ${result.updated.join(', ')}`);
      })
      .catch(error => {
        console.error('💥 Failed to update ticket:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Invalid JSON input');
    console.error(error.message);
    process.exit(1);
  }
}

export { updateJiraTicket };
