package socket

import (
	"io"
	"log"
	"net/http"

	"github.com/gorilla/securecookie"
	"github.com/gorilla/websocket"

	"github.com/arponr/yoneda/cast"
	"github.com/arponr/yoneda/data"
)

type messageData struct {
	Login *struct {
		Name, Pass string
	} `json:",omitempty"`

	Register *struct {
		Name, Pass string
	} `json:",omitempty"`

	SetCookie string `json:",omitempty"`

	ThreadList []*data.Thread `json:",omitempty"`

	NewThread *data.Thread `json:",omitempty"`

	Message *data.Message `json:",omitempty"`

	Messages *struct {
		ThreadId int
		Ms       []*data.Message
	} `json:",omitempty"`
}

type message struct {
	Action string
	Info   string
	Data   messageData
}

var global struct {
	casts    cast.Set
	sc       *securecookie.SecureCookie
	upgrader websocket.Upgrader
}

func Init(casts cast.Set) {
	global.casts = casts
	global.sc = securecookie.New(
		securecookie.GenerateRandomKey(32),
		securecookie.GenerateRandomKey(32),
	)
	global.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
}

func Handler(w http.ResponseWriter, r *http.Request) {
	var err error
	defer func() {
		if err != nil {
			log.Println(err)
			// serveError(w, err)
		}
	}()

	s, err := newSession(w, r)
	if err != nil {
		return
	}

	go func() {
		for m := range s.m {
			if err := s.c.WriteJSON(m); err != nil {
				if err == io.EOF {
					err = nil
				}
				return
			}
		}
	}()

	s.getUser()

	for {
		m := new(message)
		if err := s.c.ReadJSON(m); err != nil {
			if err == io.EOF {
				err = nil
			}
			break
		}
		if err := s.Handle(m); err != nil {
			log.Println(err)
		}
	}
}

type session struct {
	m chan *message
	u *data.User
	r *http.Request
	c *websocket.Conn
}

func newSession(w http.ResponseWriter, r *http.Request) (*session, error) {
	c, err := global.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, err
	}
	s := &session{
		m: make(chan *message, 1),
		u: nil,
		r: r,
		c: c,
	}
	return s, nil
}

func (s *session) getCookie(key string) (interface{}, error) {
	cookie, err := s.r.Cookie("yoneda")
	if err != nil {
		return nil, err
	}
	val := make(map[string]interface{})
	if err = global.sc.Decode("yoneda", cookie.Value, &val); err != nil {
		return nil, err
	}
	return val[key], nil
}

func (s *session) setCookie(key string, val interface{}) error {
	m := map[string]interface{}{key: val}
	enc, err := global.sc.Encode("yoneda", m)
	if err != nil {
		return err
	}
	cookie := (&http.Cookie{Name: "yoneda", Value: enc}).String()
	s.m <- &message{
		Action: "setCookie",
		Data:   messageData{SetCookie: cookie},
	}
	return nil
}

func (s *session) getUser() {
	// intentionally ignore errors and just require login
	cookie, err := s.getCookie("id")
	if err != nil {
		s.m <- &message{Action: "loginRequest"}
		return
	}
	id, ok := cookie.(int)
	if !ok {
		s.m <- &message{Action: "loginRequest"}
		return
	}
	name, err := data.UserIdToName(id)
	if err != nil {
		s.m <- &message{Action: "loginRequest", Info: err.Error()}
		return
	}
	s.setUser(id, name)
}

func (s *session) setUser(id int, name string) {
	s.u = &data.User{Id: id, Name: name}
	s.m <- &message{Action: "loginSuccess"}

	// intentionally ignore errors when setting cookie
	s.setCookie("id", id)
}

func (s *session) Handle(m *message) (err error) {
	defer func() {
		if err != nil {
			s.HandleError(err)
		}
	}()

	switch m.Action {
	case "login":
		return s.HandleLogin(m)
	case "register":
		return s.HandleRegister(m)
	}

	if s.u == nil {
		return nil
	}

	switch m.Action {
	case "newThread":
		return s.HandleNewThread(m)
	case "threadList":
		return s.HandleThreadList(m)
	case "messages":
		return s.HandleMessages(m)
	}

	return nil
}
