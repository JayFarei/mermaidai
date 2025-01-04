package logutil

import (
	"bytes"
	"encoding/json"
	"io"
)

type Indenter struct {
	b bytes.Buffer
	W io.Writer
}

func (i *Indenter) Write(p []byte) (int, error) {
	i.b.Reset()
	json.Indent(&i.b, p, "", "  ")
	n, err := i.b.WriteTo(i.W)
	return int(n), err
}
