const REPO_OWNER = "qqqxtqxt";
const REPO_NAME = "emoji";
const BRANCH = "main";

const SERVER_INFO = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: {} },
  serverInfo: { name: "emoji-mcp", version: "1.0.0" },
};

const TOOLS = [
  {
    name: "list_emoji",
    description: "列出仓库中所有可用的 emoji 文件名",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

function jsonRpcOk(id: string | number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function listEmoji(): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${BRANCH}`,
    { headers: { "User-Agent": "emoji-mcp-worker", Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return data.tree
    .filter((f) => f.type === "blob" && f.path.toLowerCase().endsWith(".png"))
    .map((f) => f.path);
}

async function handleToolCall(id: string | number, params: { name: string; arguments?: Record<string, unknown> }) {
  try {
    if (params.name === "list_emoji") {
      const names = await listEmoji();
      return jsonRpcOk(id, {
        content: [{ type: "text", text: names.join("\n") }],
      });
    }
    return jsonRpcError(id, -32602, `Unknown tool: ${params.name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRpcOk(id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true });
  }
}

async function handleRequest(body: Record<string, unknown>) {
  const method = body.method as string;
  const id = body.id as string | number | undefined;

  switch (method) {
    case "initialize":
      return jsonRpcOk(id!, SERVER_INFO);
    case "notifications/initialized":
      return null;
    case "ping":
      return jsonRpcOk(id!, {});
    case "tools/list":
      return jsonRpcOk(id!, { tools: TOOLS });
    case "tools/call":
      return handleToolCall(id!, body.params as { name: string; arguments?: Record<string, unknown> });
    default:
      return jsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, mcp-session-id",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response("emoji-mcp is running", { status: 200, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const result = await handleRequest(body);

      if (result === null) {
        return new Response(null, { status: 202, headers: corsHeaders });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch {
      return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
