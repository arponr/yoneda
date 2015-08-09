package socket

import (
	"github.com/arponr/yoneda/data"
)

func (s *session) HandleError(err error) {
	s.m <- &message{Action: "error", Info: err.Error()}
}

func (s *session) HandleLogin(m *message) (err error) {
	d := m.Data.Login
	if d == nil {
		return nil
	}
	id, err := data.Login(d.Name, d.Pass)
	if err != nil {
		s.m <- &message{Action: "loginRequest", Info: err.Error()}
	} else {
		s.setUser(id, d.Name)
	}
	return nil
}

func (s *session) HandleRegister(m *message) (err error) {
	d := m.Data.Register
	if d == nil {
		return nil
	}
	id, err := data.Register(d.Name, d.Pass)
	if err != nil {
		s.m <- &message{Action: "loginRequest", Info: err.Error()}
	} else {
		s.setUser(id, d.Name)
	}
	return nil
}

func (s *session) HandleNewThread(m *message) (err error) {
	d := m.Data.NewThread
	if d == nil {
		return nil
	}
	userIds := make([]int, len(d.Users), len(d.Users)+1)
	for i, u := range d.Users {
		userIds[i], err = data.UserNameToId(u.Name)
		if err != nil {
			return err
		}
	}
	userIds = append(userIds, s.u.Id)
	d.Id, err = data.InsertThread(d.Name, userIds)
	if err != nil {
		return err
	}
	d.LastMessage.Author = s.u.Name
	d.LastMessage.ThreadId = d.Id
	if err = data.InsertMessage(d.LastMessage); err != nil {
		return err
	}
	global.casts.Add(d.Id)
	// notify all thread users of new thread
	return nil
}

func (s *session) HandleThreadList(m *message) (err error) {
	ts, err := data.GetThreads(s.u.Id)
	if err != nil {
		return err
	}
	s.m <- &message{
		Action: "threadList",
		Data:   messageData{ThreadList: ts},
	}
	return nil
}

func (s *session) HandleMessages(m *message) (err error) {
	d := m.Data.Messages
	d.Ms, err = data.GetMessages(d.ThreadId)
	if err != nil {
		return err
	}
	s.m <- m
	return nil
}

func (s *session) HandleMessage(m *message) (err error) {
	d := m.Data.Message
	if d == nil {
		return nil
	}
	d.Author = s.u.Name
	if err = data.InsertMessage(d); err != nil {
		return err
	}
	global.casts[d.ThreadId].M <- d
	return nil
}

func (s *session) WriteMessage(d *data.Message) {
	s.m <- &message{
		Action: "message",
		Data:   messageData{Message: d},
	}
}
