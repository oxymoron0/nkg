package model

// QueryRequest represents a Notion database query request body.
type QueryRequest struct {
	Filter      any          `json:"filter,omitempty"`
	Sorts       []SortObject `json:"sorts,omitempty"`
	PageSize    int          `json:"page_size,omitempty"`
	StartCursor string       `json:"start_cursor,omitempty"`
}

// SortObject defines a sort order for database queries.
type SortObject struct {
	Property  string `json:"property,omitempty"`
	Direction string `json:"direction,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
}

// TitleFilter builds a filter object for title property.
func TitleFilter(name string, exact bool) map[string]any {
	op := "contains"
	if exact {
		op = "equals"
	}
	return map[string]any{
		"property": "Name",
		"title": map[string]any{
			op: name,
		},
	}
}
