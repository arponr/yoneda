package data

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"regexp"
	"sort"
	"time"

	"code.google.com/p/go.crypto/bcrypt"
	_ "github.com/lib/pq"
)

type User struct {
	Id   int
	Name string
}

type Message struct {
	ThreadId int
	Author   string
	Body     string
	Markdown bool
	Tex      bool
	Time     time.Time
}

type Thread struct {
	Id          int
	Name        string
	Users       []*User
	LastMessage *Message
}

type byTime []*Thread

func (t byTime) Len() int      { return len(t) }
func (t byTime) Swap(i, j int) { t[i], t[j] = t[j], t[i] }

func (t byTime) Less(i, j int) bool {
	return t[i].LastMessage.Time.After(t[j].LastMessage.Time)
}

var db *sql.DB

func dbURL() string {
	if os.Getenv("LOCALDEV") == "true" {
		return os.Getenv("DATABASE_URL")
	} else {
		regex := regexp.MustCompile(
			"(?i)^postgres://(?:([^:@]+):([^@]*)@)?([^@/:]+):(\\d+)/(.*)$")
		matches := regex.FindStringSubmatch(os.Getenv("DATABASE_URL"))
		if matches == nil {
			log.Fatalf("DATABASE_URL variable must look like: "+
				"postgres://username:password@hostname:port/dbname (not '%v')",
				os.Getenv("DATABASE_URL"))
		}
		sslmode := os.Getenv("PGSSL")
		if sslmode == "" {
			sslmode = "disable"
		}
		return fmt.Sprintf("user=%s password=%s host=%s port=%s dbname=%s sslmode=%s",
			matches[1], matches[2], matches[3], matches[4], matches[5], sslmode)
	}
}

func OpenDB() error {
	var err error
	db, err = sql.Open("postgres", dbURL())
	return err
}

func Login(name, pass string) (int, error) {
	var id int
	var hash []byte
	q := "SELECT id, hash FROM users WHERE name = $1"
	if err := db.QueryRow(q, name).Scan(&id, &hash); err != nil {
		return -1, errors.New("invalid username")
	}
	if err := bcrypt.CompareHashAndPassword(hash, []byte(pass)); err != nil {
		return -1, errors.New("username and password do not match")
	}
	return id, nil
}

func Register(name, pass string) (int, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		return -1, err
	}
	var id int
	q := "INSERT INTO users (name, hash) VALUES ($1, $2) RETURNING id"
	if err = db.QueryRow(q, name, hash).Scan(&id); err != nil {
		return -1, errors.New("username is taken already")
	}
	return id, nil
}

func UserInThread(userId, threadId int) bool {
	q := "SELECT user_id FROM user_threads ut" +
		" WHERE ut.thread_id = $1 AND ut.user_id = $2"
	var i int
	return db.QueryRow(q, threadId, userId).Scan(&i) == nil
}

func GetThread(userId, threadId int, threadName string) (*Thread, error) {
	if threadName == "" {
		q := "SELECT name FROM threads WHERE id = $1"
		err := db.QueryRow(q, threadId).Scan(&threadName)
		if err != nil {
			return nil, err
		}
	}
	t := &Thread{Id: threadId, Name: threadName}
	var err error
	t.Users, err = GetRecipients(userId, threadId)
	if err != nil {
		return nil, err
	}
	t.LastMessage, err = GetLastMessage(threadId)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func GetThreads(userId int) ([]*Thread, error) {
	q := "SELECT t.id, t.name FROM threads t, user_threads ut" +
		" WHERE ut.user_id = $1 AND ut.thread_id = t.id"
	rows, err := db.Query(q, userId)
	if err != nil {
		return nil, err
	}
	var ts []*Thread
	for rows.Next() {
		var threadId int
		var threadName string
		if err := rows.Scan(&threadId, &threadName); err != nil {
			return nil, err
		}
		t, err := GetThread(userId, threadId, threadName)
		if err != nil {
			return nil, err
		}
		ts = append(ts, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Sort(byTime(ts))
	return ts, nil
}

func GetRecipients(userId, threadId int) ([]*User, error) {
	q := "SELECT u.id, u.name FROM users u, user_threads ut" +
		" WHERE ut.thread_id = $1 AND u.id = ut.user_id AND u.id != $2"
	rows, err := db.Query(q, threadId, userId)
	if err != nil {
		return nil, err
	}
	var us []*User
	for rows.Next() {
		u := new(User)
		err = rows.Scan(&u.Id, &u.Name)
		if err != nil {
			return nil, err
		}
		us = append(us, u)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return us, nil
}

func GetLastMessage(threadId int) (*Message, error) {
	q := "SELECT thread_id, author, body, markdown, tex, time" +
		" FROM messages WHERE thread_id = $1 ORDER BY time DESC LIMIT 1"
	m := new(Message)
	err := db.QueryRow(q, threadId).Scan(
		&m.ThreadId, &m.Author, &m.Body, &m.Markdown, &m.Tex, &m.Time)
	if err == sql.ErrNoRows {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return m, nil
}

func GetMessages(threadId int) ([]*Message, error) {
	q := "SELECT thread_id, author, body, markdown, tex, time" +
		" FROM messages WHERE thread_id = $1"
	rows, err := db.Query(q, threadId)
	if err != nil {
		return nil, err
	}
	var ms []*Message
	for rows.Next() {
		m := new(Message)
		err = rows.Scan(
			&m.ThreadId, &m.Author, &m.Body, &m.Markdown, &m.Tex, &m.Time)
		if err != nil {
			return nil, err
		}
		ms = append(ms, m)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return ms, nil
}

func AllThreadIds() ([]int, error) {
	rows, err := db.Query("SELECT id FROM threads")
	if err != nil {
		return nil, err
	}
	var ids []int
	for rows.Next() {
		var id int
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func UserIdToName(id int) (string, error) {
	q := "SELECT name FROM users WHERE id = $1"
	var name string
	err := db.QueryRow(q, id).Scan(&name)
	return name, err
}

func UserNameToId(name string) (int, error) {
	q := "SELECT id FROM users WHERE name = $1"
	var id int
	err := db.QueryRow(q, name).Scan(&id)
	return id, err
}

func UserNamesToIds(names []string) ([]int, error) {
	ids := make([]int, 0, len(names))
	for i, name := range names {
		var err error
		ids[i], err = UserNameToId(name)
		if err != nil {
			return nil, err
		}
	}
	return ids, nil
}

func InsertMessage(m *Message) error {
	q := "INSERT INTO messages (thread_id, author, body, markdown, tex, time)" +
		" VALUES ($1, $2, $3, $4, $5, $6)"
	m.Time = time.Now().UTC()
	_, err := db.Exec(q, m.ThreadId, m.Author, m.Body, m.Markdown, m.Tex, m.Time)
	return err
}

func InsertThread(name string, userIds []int) (int, error) {
	q := "INSERT INTO threads (name) VALUES ($1) RETURNING id"
	var threadId int
	err := db.QueryRow(q, name).Scan(&threadId)
	if err != nil {
		return -1, err
	}
	for _, userId := range userIds {
		if err = InsertUserThread(userId, threadId); err != nil {
			return -1, err
		}
	}
	return threadId, err
}

func InsertUserThread(userId, threadId int) error {
	q := "INSERT INTO user_threads (user_id, thread_id) VALUES ($1, $2)"
	_, err := db.Exec(q, userId, threadId)
	return err
}
