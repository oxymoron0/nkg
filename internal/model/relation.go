package model

// RelationProperties lists all relation property names in the database.
var RelationProperties = []string{
	"skos:broader",
	"skos:narrower",
	"dcterms:hasPart",
	"dcterms:isPartOf",
	"dcterms:requires",
	"dcterms:isRequiredBy",
	"dcterms:references",
	"dcterms:isReferencedBy",
	"skos:related",
	"schema:previousItem",
	"schema:nextItem",
}

// InverseRelation maps each relation to its inverse.
// Notion dual_property handles the actual sync; this is for display/validation.
var InverseRelation = map[string]string{
	"skos:broader":           "skos:narrower",
	"skos:narrower":          "skos:broader",
	"dcterms:hasPart":        "dcterms:isPartOf",
	"dcterms:isPartOf":       "dcterms:hasPart",
	"dcterms:requires":       "dcterms:isRequiredBy",
	"dcterms:isRequiredBy":   "dcterms:requires",
	"dcterms:references":     "dcterms:isReferencedBy",
	"dcterms:isReferencedBy": "dcterms:references",
	"skos:related":           "skos:related",
	"schema:previousItem":    "schema:nextItem",
	"schema:nextItem":        "schema:previousItem",
}

// ValidRelation checks if the given name is a valid relation property.
func ValidRelation(name string) bool {
	_, ok := InverseRelation[name]
	return ok
}
