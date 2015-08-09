package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/context"

	"github.com/arponr/yoneda/cast"
	"github.com/arponr/yoneda/data"
	"github.com/arponr/yoneda/socket"
)

// type encoderSet map[encoder]bool

// var global struct {
// 	db    *sql.DB
// 	store sessions.Store
// 	conns struct {
// 		sync.RWMutex
// 		m map[int]encoderSet
// 	}
// }

// func initCache() error {
// 	rows, err := db.Query("SELECT thread_id FROM threads")
// 	if err != nil {
// 		return err
// 	}
// 	for rows.Next() {
// 		var threadId int
// 		if err = rows.Scan(&threadId); err != nil {
// 			return err
// 		}
// 		global.conns.m[threadId] = make(encoderSet)
// 	}
// 	return rows.Err()
// }

// const (
// 	loginURL      = "/login"
// 	registerURL   = "/register"
// 	threadListURL = "/data/threadlist"
// 	threadURL     = "/data/thread/"
// 	messagesURL   = "/data/messages/"
// 	newThreadURL  = "/newthread"
// 	msgPreviewURL = "/preview"
// 	socketURL     = "/socket/"
// 	staticURL     = "/static/"
// )

func main() {
	var err error
	if err = data.OpenDB(); err != nil {
		log.Fatal(err)
	}
	casts, err := cast.ThreadCasts()
	if err != nil {
		log.Fatal(err)
	}
	socket.Init(casts)

	http.Handle("/", http.FileServer(http.Dir("static")))
	// http.HandleFunc(loginURL, handler(login, false))
	// http.HandleFunc(registerURL, handler(register, false))
	// http.HandleFunc(threadListURL, handler(serveThreadList, true))
	// http.HandleFunc(threadURL, handler(serveThread, true))
	// http.HandleFunc(messagesURL, handler(serveMessages, true))
	// http.HandleFunc(newThreadURL, handler(newThread, true))
	http.HandleFunc("/socket", socket.Handler)

	err = http.ListenAndServe(
		":"+os.Getenv("PORT"),
		context.ClearHandler(http.DefaultServeMux),
	)
	if err != nil {
		log.Fatal(err)
	}
}
