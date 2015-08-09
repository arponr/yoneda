CREATE TABLE users (
       id   serial PRIMARY KEY,
       name text   UNIQUE NOT NULL,
       hash bytea  NOT NULL
);

CREATE TABLE threads (
       id   serial PRIMARY KEY,
       name text   NOT NULL
);

CREATE TABLE messages (
       id        serial    PRIMARY KEY,
       thread_id int       REFERENCES threads NOT NULL,
       author    text      REFERENCES users (name) NOT NULL,
       body      text,
       markdown  boolean,
       tex       boolean,
       time      timestamp DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ind_message_thread ON messages (thread_id);

CREATE TABLE user_threads (
       user_id   int REFERENCES users (id) NOT NULL,
       thread_id int REFERENCES threads (id) NOT NULL,
       CONSTRAINT pk_user_thread PRIMARY KEY (user_id, thread_id)
);
CREATE INDEX ind_thread_user ON user_threads (thread_id);
