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
