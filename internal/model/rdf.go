package model

import "strings"

// RDF namespace constants for the knowledge graph.
const (
	NSConcept  = "http://knowledge.local/concept/"
	NSOntology = "http://knowledge.local/ontology/"
	NSGraph    = "http://knowledge.local/graph/nkg"
	NSMeta     = "http://knowledge.local/graph/meta"
)

// RelationToURI maps Notion relation property names to full RDF predicate URIs.
var RelationToURI = map[string]string{
	"skos:broader":           "http://www.w3.org/2004/02/skos/core#broader",
	"skos:narrower":          "http://www.w3.org/2004/02/skos/core#narrower",
	"dcterms:hasPart":        "http://purl.org/dc/terms/hasPart",
	"dcterms:isPartOf":       "http://purl.org/dc/terms/isPartOf",
	"dcterms:requires":       "http://purl.org/dc/terms/requires",
	"dcterms:isRequiredBy":   "http://purl.org/dc/terms/isRequiredBy",
	"dcterms:references":     "http://purl.org/dc/terms/references",
	"dcterms:isReferencedBy": "http://purl.org/dc/terms/isReferencedBy",
	"skos:related":           "http://www.w3.org/2004/02/skos/core#related",
	"schema:previousItem":    "http://schema.org/previousItem",
	"schema:nextItem":        "http://schema.org/nextItem",
}

// URIToRelation maps full RDF predicate URIs back to Notion relation names.
var URIToRelation map[string]string

func init() {
	URIToRelation = make(map[string]string, len(RelationToURI))
	for rel, uri := range RelationToURI {
		URIToRelation[uri] = rel
	}
}

// ConceptURI returns the full RDF URI for a Notion page ID.
func ConceptURI(pageID string) string {
	return NSConcept + strings.ReplaceAll(pageID, "-", "")
}
