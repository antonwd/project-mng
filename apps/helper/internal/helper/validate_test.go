package helper

import (
	"strings"
	"testing"
)

func TestValidateConfigName(t *testing.T) {
	cases := []struct {
		name    string
		wantErr bool
	}{
		{"myapp", false},
		{"my-app", false},
		{"a", false},
		{"123abc", false},
		{strings.Repeat("a", 63), false},
		{"", true},
		{strings.Repeat("a", 64), true},
		{"-leading-dash", true},
		{"UPPERCASE", true},
		{"with.dot", true},
		{"with/slash", true},
		{"with space", true},
		{"with_underscore", true},
		{"unícode", true},
		{"..", true},
	}
	for _, tc := range cases {
		err := ValidateConfigName(tc.name)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateConfigName(%q): wantErr=%v, gotErr=%v", tc.name, tc.wantErr, err)
		}
	}
}

func TestValidateDomain(t *testing.T) {
	cases := []struct {
		domain  string
		wantErr bool
	}{
		{"example.com", false},
		{"sub.example.com", false},
		{"a.b.c.d.example.com", false},
		{"xn--bcher-kva.example", false}, // punycode IDN
		{"123.example.com", false},
		{"", true},
		{"EXAMPLE.COM", true},                     // uppercase
		{"-leading.example.com", true},            // leading dash
		{"trailing-.example.com", true},           // trailing dash
		{"*.example.com", true},                   // wildcard
		{"exa mple.com", true},                    // space
		{"example", true},                         // no dot (single label)
		{strings.Repeat("a", 64) + ".com", true},  // label too long
		{strings.Repeat("a.", 130) + "com", true}, // total too long
		{"example..com", true},                    // empty label
	}
	for _, tc := range cases {
		err := ValidateDomain(tc.domain)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateDomain(%q): wantErr=%v, gotErr=%v", tc.domain, tc.wantErr, err)
		}
	}
}

func TestValidateEmail(t *testing.T) {
	cases := []struct {
		email   string
		wantErr bool
	}{
		{"you@example.com", false},
		{"a+b@example.co.uk", false},
		{"a.b.c@x.y", false},
		{"", true},
		{"noatsign", true},
		{"@example.com", true},
		{"you@", true},
		{"a@b@c", true},
		{"you example.com", true},
		{strings.Repeat("a", 250) + "@x.y", true},
	}
	for _, tc := range cases {
		err := ValidateEmail(tc.email)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateEmail(%q): wantErr=%v, gotErr=%v", tc.email, tc.wantErr, err)
		}
	}
}
