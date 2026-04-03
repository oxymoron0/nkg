package rdf

import "fmt"

// AllConcepts returns SPARQL to fetch all concepts with their labels and metadata.
func AllConcepts(graphURI string) string {
	return fmt.Sprintf(`SELECT ?id ?label ?description ?created ?modified ?exactMatch ?closeMatch
WHERE {
  GRAPH <%s> {
    ?id a <%sConcept> .
    ?id <http://www.w3.org/2000/01/rdf-schema#label> ?label .
    OPTIONAL { ?id <http://purl.org/dc/terms/description> ?description }
    OPTIONAL { ?id <http://purl.org/dc/terms/created> ?created }
    OPTIONAL { ?id <http://purl.org/dc/terms/modified> ?modified }
    OPTIONAL { ?id <http://www.w3.org/2004/02/skos/core#exactMatch> ?exactMatch }
    OPTIONAL { ?id <http://www.w3.org/2004/02/skos/core#closeMatch> ?closeMatch }
  }
}`, graphURI, "http://knowledge.local/ontology/")
}

// AllRelations returns SPARQL to fetch all relation triples in the graph.
func AllRelations(graphURI string) string {
	return fmt.Sprintf(`SELECT ?from ?predicate ?to
WHERE {
  GRAPH <%s> {
    ?from ?predicate ?to .
    ?from a <%sConcept> .
    ?to a <%sConcept> .
    FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
  }
}`, graphURI, "http://knowledge.local/ontology/", "http://knowledge.local/ontology/")
}

// ConceptRelations returns SPARQL to fetch all relations for a specific concept.
func ConceptRelations(graphURI, conceptURI string) string {
	return fmt.Sprintf(`SELECT ?predicate ?target ?direction
WHERE {
  GRAPH <%s> {
    { <%s> ?predicate ?target . BIND("outgoing" AS ?direction) }
    UNION
    { ?target ?predicate <%s> . BIND("incoming" AS ?direction) }
    ?target a <%sConcept> .
    FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
  }
}`, graphURI, conceptURI, conceptURI, "http://knowledge.local/ontology/")
}

// GetWatermark returns SPARQL to read the last sync timestamp.
func GetWatermark(metaGraphURI string) string {
	return fmt.Sprintf(`SELECT ?ts
WHERE {
  GRAPH <%s> {
    <http://knowledge.local/sync> <http://purl.org/dc/terms/modified> ?ts .
  }
}`, metaGraphURI)
}

// SetWatermark returns SPARQL to update the sync timestamp.
func SetWatermark(metaGraphURI, timestamp string) string {
	return fmt.Sprintf(
		"DELETE WHERE { GRAPH <%s> { <http://knowledge.local/sync> <http://purl.org/dc/terms/modified> ?ts } };\n"+
			"INSERT DATA { GRAPH <%s> { <http://knowledge.local/sync> <http://purl.org/dc/terms/modified> \"%s\"^^<http://www.w3.org/2001/XMLSchema#dateTime> } }",
		metaGraphURI, metaGraphURI, timestamp,
	)
}

// DropGraph returns SPARQL to clear all triples in a named graph.
func DropGraph(graphURI string) string {
	return fmt.Sprintf("DROP SILENT GRAPH <%s>", graphURI)
}
