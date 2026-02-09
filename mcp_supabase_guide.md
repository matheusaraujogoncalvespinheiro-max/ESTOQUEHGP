To allow your AI agent (Claude, Cline, or Roo Code) to interact directly with your Supabase database, follow these steps to configure the Supabase MCP Server.

## Prerequisites
- **Node.js**: You MUST have Node.js installed to run `npx`. 
  - Download and install from: [nodejs.org](https://nodejs.org/) (Select the **LTS** version).
  - After installing, restart your AI client (VS Code or Claude Desktop) to update the PATH.

## 1. Get your Credentials
You will need two pieces of information from your Supabase Dashboard (**Project Settings -> API**):
- **Project URL** (e.g., `https://xyz.supabase.co`)
- **service_role key** (This is a secret key that bypasses RLS, needed for the AI to manage the database).

## 2. Configuration for AI Clients

Add the following JSON block to your client's MCP settings:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server"
      ],
      "env": {
        "SUPABASE_URL": "YOUR_PROJECT_URL",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SERVICE_ROLE_KEY"
      }
    }
  }
}
```

## 3. Where to find the Settings file?

### Roo Code / Cline (VS Code)
1. Open Command Palette (`Ctrl+Shift+P`).
2. Type `Configure MCP Servers`.
3. Paste the JSON block inside the `mcpServers` object.

### Claude Desktop
- **Windows**: `%AppData%\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

## 4. What can the AI do now?
Once configured, the AI will be able to:
- List all your tables.
- Run SQL queries directly.
- Inspect the schema of your database.
- Help you debug data issues or create new tables/migrations.
