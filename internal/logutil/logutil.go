package logutil

import (
	"bytes"
	"encoding/json"
	"io"
)

type JSONIndenter struct {
	W      io.Writer
	Prefix string
	Indent string

	b bytes.Buffer
}

func (i *JSONIndenter) Write(p []byte) (int, error) {
	i.b.Reset()
	if err := json.Indent(&i.b, p, i.Prefix, i.Indent); err != nil {
		return 0, err
	}
	n, err := i.b.WriteTo(i.W)
	return int(n), err
}
