package api

import (
	"encoding/json"
	"testing"
)

func TestParsePageFromResult_RecordsTruncation(t *testing.T) {
	tests := []struct {
		name             string
		raw              string
		wantTruncated    map[string]bool
		wantRelationLens map[string]int
	}{
		{
			name: "has_more true is recorded",
			raw: `{
				"id": "page-truncated",
				"properties": {
					"Name": {"title": [{"plain_text": "K8s"}]},
					"skos:broader": {
						"relation": [{"id": "parent-1"}, {"id": "parent-2"}],
						"has_more": true
					}
				}
			}`,
			wantTruncated:    map[string]bool{"skos:broader": true},
			wantRelationLens: map[string]int{"skos:broader": 2},
		},
		{
			name: "has_more false is not recorded",
			raw: `{
				"id": "page-small",
				"properties": {
					"Name": {"title": [{"plain_text": "Cilium"}]},
					"skos:narrower": {
						"relation": [{"id": "child-1"}],
						"has_more": false
					}
				}
			}`,
			wantTruncated:    map[string]bool{},
			wantRelationLens: map[string]int{"skos:narrower": 1},
		},
		{
			name: "mixed properties",
			raw: `{
				"id": "page-mixed",
				"properties": {
					"Name": {"title": [{"plain_text": "Linux"}]},
					"skos:broader": {
						"relation": [{"id": "p1"}],
						"has_more": false
					},
					"dcterms:hasPart": {
						"relation": [{"id": "c1"}, {"id": "c2"}],
						"has_more": true
					}
				}
			}`,
			wantTruncated:    map[string]bool{"dcterms:hasPart": true},
			wantRelationLens: map[string]int{"skos:broader": 1, "dcterms:hasPart": 2},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			page, err := parsePageFromResult(json.RawMessage(tt.raw))
			if err != nil {
				t.Fatalf("parsePageFromResult: %v", err)
			}

			for rel, wantLen := range tt.wantRelationLens {
				got := len(page.Relations[rel])
				if got != wantLen {
					t.Errorf("len(Relations[%q]) = %d, want %d", rel, got, wantLen)
				}
			}

			for rel := range tt.wantTruncated {
				if !page.RelationTruncated[rel] {
					t.Errorf("RelationTruncated[%q] = false, want true", rel)
				}
			}

			for rel, gotTrunc := range page.RelationTruncated {
				if gotTrunc && !tt.wantTruncated[rel] {
					t.Errorf("RelationTruncated[%q] = true, want false", rel)
				}
			}
		})
	}
}

func TestParsePageFromResult_PopulatesBasicFields(t *testing.T) {
	raw := `{
		"id": "abc-def-123",
		"last_edited_time": "2026-04-15T10:00:00.000Z",
		"properties": {
			"Name": {"title": [{"plain_text": "Hello"}, {"plain_text": " World"}]},
			"Summary": {"rich_text": [{"plain_text": "A greeting"}]}
		}
	}`

	page, err := parsePageFromResult(json.RawMessage(raw))
	if err != nil {
		t.Fatalf("parsePageFromResult: %v", err)
	}

	if page.ID != "abcdef123" {
		t.Errorf("ID = %q, want %q", page.ID, "abcdef123")
	}
	if page.Name != "Hello World" {
		t.Errorf("Name = %q, want %q", page.Name, "Hello World")
	}
	if page.Summary != "A greeting" {
		t.Errorf("Summary = %q, want %q", page.Summary, "A greeting")
	}
	if page.LastEditedTime != "2026-04-15T10:00:00.000Z" {
		t.Errorf("LastEditedTime = %q, want %q", page.LastEditedTime, "2026-04-15T10:00:00.000Z")
	}
	if page.RelationTruncated == nil {
		t.Error("RelationTruncated should be initialized (non-nil)")
	}
}
