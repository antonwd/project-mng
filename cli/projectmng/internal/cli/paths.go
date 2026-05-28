package cli

import "os"

// Paths are the canonical on-host locations the installer creates. Tests
// override them via Env.
type Paths struct {
	OptDir     string // /opt/projectmng
	EtcDir     string // /etc/projectmng
	ComposeFile string // /opt/projectmng/docker-compose.yml
	EnvFile    string // /opt/projectmng/.env
	VersionFile string // /opt/projectmng/.version
	MasterKey   string // /etc/projectmng/master.key
	GitHubKey   string // /etc/projectmng/github-app.pem
}

func DefaultPaths() Paths {
	return Paths{
		OptDir:      "/opt/projectmng",
		EtcDir:      "/etc/projectmng",
		ComposeFile: "/opt/projectmng/docker-compose.yml",
		EnvFile:     "/opt/projectmng/.env",
		VersionFile: "/opt/projectmng/.version",
		MasterKey:   "/etc/projectmng/master.key",
		GitHubKey:   "/etc/projectmng/github-app.pem",
	}
}

// LoadPathsFromEnv lets PROJECTMNG_OPT/PROJECTMNG_ETC point the CLI at a
// throwaway install (used by tests + the smoke harness).
func LoadPathsFromEnv() Paths {
	p := DefaultPaths()
	if o := os.Getenv("PROJECTMNG_OPT"); o != "" {
		p.OptDir = o
		p.ComposeFile = o + "/docker-compose.yml"
		p.EnvFile = o + "/.env"
		p.VersionFile = o + "/.version"
	}
	if e := os.Getenv("PROJECTMNG_ETC"); e != "" {
		p.EtcDir = e
		p.MasterKey = e + "/master.key"
		p.GitHubKey = e + "/github-app.pem"
	}
	return p
}
