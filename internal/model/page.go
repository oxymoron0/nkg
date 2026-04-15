package model

// Page represents a knowledge entry from the Notion database.
type Page struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Summary        string           `json:"summary,omitempty"`
	CreatedTime    string           `json:"created_time,omitempty"`
	LastEditedTime string           `json:"last_edited_time,omitempty"`
	Relations      map[string][]Ref `json:"relations,omitempty"`
	// RelationTruncated marks relation properties whose inline array in the
	// Notion database query response was truncated (has_more=true). Callers
	// that need the full list must re-fetch via api.GetRelationPropertyIDs.
	RelationTruncated map[string]bool `json:"-"`
	ExactMatch        string          `json:"skos:exactMatch,omitempty"`
	CloseMatch        string          `json:"skos:closeMatch,omitempty"`
}

// Ref is a lightweight reference to another page.
type Ref struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}
