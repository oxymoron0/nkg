import { api } from './client';

export type GraphNode = {
  id: string;
  label: string;
  summary?: string;
  group?: string;
};

// react-force-graph mutates source/target from id strings into node objects
// once the simulation initializes. The wider type reflects both shapes so the
// renderer can read `.x` / `.y` at draw time without casts.
export type GraphLink = {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    relations: string[];
  };
};

export async function fetchGraph(relations?: string[]): Promise<GraphData> {
  const query = relations && relations.length > 0 ? { relations: relations.join(',') } : undefined;

  const { data, error, response } = await api.GET('/api/v1/graph', {
    params: { query },
  });

  if (error) {
    throw new Error(`graph fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload = (data as { data?: RawGraph } | undefined)?.data;
  if (!payload) {
    throw new Error('graph fetch: empty response body');
  }

  return {
    nodes: (payload.nodes ?? []).map((n) => ({
      id: n.id ?? '',
      label: n.label ?? '',
      summary: n.summary,
      group: n.group,
    })),
    links: (payload.edges ?? []).map((e) => ({
      id: e.id ?? '',
      source: e.source ?? '',
      target: e.target ?? '',
      relation: e.relation ?? '',
    })),
    meta: {
      nodeCount: payload.meta?.node_count ?? 0,
      edgeCount: payload.meta?.edge_count ?? 0,
      relations: payload.meta?.relations ?? [],
    },
  };
}

type RawGraph = {
  nodes?: Array<{ id?: string; label?: string; summary?: string; group?: string }>;
  edges?: Array<{ id?: string; source?: string; target?: string; relation?: string }>;
  meta?: { node_count?: number; edge_count?: number; relations?: string[] };
};
