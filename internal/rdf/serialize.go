package rdf

import (
	"fmt"
	"strings"

	"github.com/leorca/nkg/internal/model"
)

// PageToInsert returns a SPARQL INSERT DATA block for the given page
// within the NKG named graph.
func PageToInsert(page *model.Page) string {
	uri := model.ConceptURI(page.ID)
	var b strings.Builder

	b.WriteString(fmt.Sprintf("INSERT DATA { GRAPH <%s> {\n", model.NSGraph))

	// rdf:type
	b.WriteString(fmt.Sprintf("  <%s> a <%sConcept> .\n", uri, model.NSOntology))

	// rdfs:label
	b.WriteString(fmt.Sprintf("  <%s> <http://www.w3.org/2000/01/rdf-schema#label> %s .\n",
		uri, escapeLiteral(page.Name)))

	// dct:description
	if page.Summary != "" {
		b.WriteString(fmt.Sprintf("  <%s> <http://purl.org/dc/terms/description> %s .\n",
			uri, escapeLiteral(page.Summary)))
	}

	// dct:created
	if page.CreatedTime != "" {
		b.WriteString(fmt.Sprintf("  <%s> <http://purl.org/dc/terms/created> %s .\n",
			uri, escapeDateTime(page.CreatedTime)))
	}

	// dct:modified
	if page.LastEditedTime != "" {
		b.WriteString(fmt.Sprintf("  <%s> <http://purl.org/dc/terms/modified> %s .\n",
			uri, escapeDateTime(page.LastEditedTime)))
	}

	// skos:exactMatch
	if page.ExactMatch != "" {
		b.WriteString(fmt.Sprintf("  <%s> <http://www.w3.org/2004/02/skos/core#exactMatch> <%s> .\n",
			uri, page.ExactMatch))
	}

	// skos:closeMatch
	if page.CloseMatch != "" {
		b.WriteString(fmt.Sprintf("  <%s> <http://www.w3.org/2004/02/skos/core#closeMatch> <%s> .\n",
			uri, page.CloseMatch))
	}

	// relations
	for rel, refs := range page.Relations {
		predURI, ok := model.RelationToURI[rel]
		if !ok {
			continue
		}
		for _, ref := range refs {
			objURI := model.ConceptURI(ref.ID)
			b.WriteString(fmt.Sprintf("  <%s> <%s> <%s> .\n", uri, predURI, objURI))
		}
	}

	b.WriteString("} }")
	return b.String()
}

// PageToDelete returns SPARQL to remove all triples about a page
// (both as subject and as object) from the NKG named graph.
func PageToDelete(pageID string) string {
	uri := model.ConceptURI(pageID)
	return fmt.Sprintf(
		"DELETE WHERE { GRAPH <%s> { <%s> ?p ?o } };\n"+
			"DELETE WHERE { GRAPH <%s> { ?s ?p <%s> } }",
		model.NSGraph, uri,
		model.NSGraph, uri,
	)
}

// TripleInsert returns SPARQL to insert a single relation triple.
func TripleInsert(fromID, toID, relation string) string {
	predURI := model.RelationToURI[relation]
	return fmt.Sprintf("INSERT DATA { GRAPH <%s> { <%s> <%s> <%s> } }",
		model.NSGraph, model.ConceptURI(fromID), predURI, model.ConceptURI(toID))
}

// TripleDelete returns SPARQL to delete a single relation triple.
func TripleDelete(fromID, toID, relation string) string {
	predURI := model.RelationToURI[relation]
	return fmt.Sprintf("DELETE DATA { GRAPH <%s> { <%s> <%s> <%s> } }",
		model.NSGraph, model.ConceptURI(fromID), predURI, model.ConceptURI(toID))
}

// escapeLiteral wraps a string as an RDF literal with proper escaping.
func escapeLiteral(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\r")
	s = strings.ReplaceAll(s, "\t", "\\t")
	return fmt.Sprintf("\"%s\"", s)
}

// escapeDateTime wraps a datetime string as an xsd:dateTime literal.
func escapeDateTime(s string) string {
	return fmt.Sprintf("\"%s\"^^<http://www.w3.org/2001/XMLSchema#dateTime>", s)
}
