package cast

import (
	"github.com/arponr/yoneda/data"
)

type messageWriter interface {
	WriteMessage(*data.Message)
}

type Cast struct {
	M chan *data.Message
	W <-chan messageWriter
}

func New() *Cast {
	return &Cast{
		M: make(chan *data.Message),
		W: make(<-chan messageWriter),
	}
}

func (c *Cast) Run() {
	for w := range c.W {
		go transcribe(c.M, w)
	}
}

func transcribe(src <-chan *data.Message, dst messageWriter) {
	for m := range src {
		dst.WriteMessage(m)
	}
}

type Set map[int]*Cast

func (s Set) Add(i int) {
	s[i] = New()
	go s[i].Run()
}

func ThreadCasts() (Set, error) {
	s := make(Set)
	ids, err := data.AllThreadIds()
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		s.Add(id)
	}
	return s, nil
}
