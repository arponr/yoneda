var Yoneda = {};
Yoneda.Util = {};

Yoneda.debug = true;

////////////////////////////////////////////////////////////////////////////////

Yoneda.Util.mapAdd = function(o, i, k, v) {
    if (!o[i]) o[i] = {};
    o[i][k] = v;
}

Yoneda.Util.isEmpty = function($el) {
    return !$.trim($el.html());
}

Yoneda.Util.parseHTML = function(tmpl) {
    return $.parseHTML(tmpl)[0];
};

Yoneda.Util.unJQuery = function(f) {
    return function(el) { f(el instanceof jQuery ? el[0] : el); }
};

Yoneda.Util.jax = Yoneda.Util.unJQuery(function (el) {
    MathJax.Hub.Queue(["Typeset", MathJax.Hub, el]);
});

Yoneda.Util.prezero = function(x) { return x < 10 ? "0" + x : x; };

Yoneda.Util.fmtTime = function(stamp, fmt) {
    var o = new Date(stamp);
    var d = function(o) {
        var y = o.getFullYear();
        var m = Yoneda.Util.prezero(o.getMonth() + 1);
        var d = Yoneda.Util.prezero(o.getDate());
        return y + "-" + m + "-" + d;
    }(o);
    var t = function(o) {
        var h = o.getHours();
        var m = Yoneda.Util.prezero(o.getMinutes());
        var p = "am";
        if (h === 0) {
            h = 12;
        } else if (h > 12) {
            h -= 12;
            p = "pm";
        }
        return h + ":" + m + p;
    }(o);
    return fmt.replace("d", d).replace("t", t)
};

////////////////////////////////////////////////////////////////////////////////

Yoneda.Util.Text = {};

Yoneda.Util.Text.fmt = function(text, md, tex) {
    return md ? Yoneda.Util.Text.texdown(text, tex) : Yoneda.Util.Text.escape(text);
};

Yoneda.Util.Text.escape = function(text) {
    return text;
};

Yoneda.Util.Text.reCensor = /\$\$[^\$]+\$\$|\$[^\$]+\$/gm;
Yoneda.Util.Text.reUncensor = /\$(\d+)\$/gm;

Yoneda.Util.Text.texdown = function(text, tex) {
    if (!tex) return markdown.toHTML(text);
    var math = [];
    function replCensor(m) {
        math.push(m);
        return "$" + (math.length - 1).toString() + "$";
    }
    function replUncensor(m, i, o, s) {
        return math[parseInt(i)];
    }
    censored = text.replace(Yoneda.Util.Text.reCensor, replCensor);
    html = markdown.toHTML(censored);
    return html.replace(Yoneda.Util.Text.reUncensor, replUncensor);
};


////////////////////////////////////////////////////////////////////////////////

var ui = null;

Yoneda.UI = function() {
    ui = this;
    
    $(document).ready(function() {
        ui.el = document.body;
        ui.threads = {};
        ui.socket = new WebSocket(
            location.origin.replace(/^https?/,"ws") + "/socket"
        );
        ui.socket.onmessage = onMessage;
    });

    function onMessage(e) {
        var m = JSON.parse(e.data)
        if (Yoneda.debug) console.log(">>", m)

        switch (m.Action) {
        case "loginRequest":
            if (!ui.loginView) {
                ui.loginView = new Yoneda.LoginView({container: ui.el});
            }
            ui.loginView.open();
            if (m.Info !== "") ui.loginView.flash(m.Info);
            return;
        case "loginSuccess":
            if (!ui.appView) {
                ui.appView = new Yoneda.AppView({container: ui.el});
            }
            ui.appView.open();
            return;
        case "setCookie":
            document.cookie = m.Data.SetCookie;
            return;
        }

        var av = ui.appView;
        if (!av) return;

        switch (m.Action) {
        case "threadList":
            var tv = av.threadListView;
            if (!tv) return;
            var tl = m.Data.ThreadList;
            if (!tl) return;
            for (var i = 0; i < tl.length; i++) {
                tv.add(tl[i]);
            }
            return;
        case "messages":
            var id = m.Data.Messages.ThreadId;
            var tv = ui.threads[id][Yoneda.ThreadView.key];
            if (!tv) return;
            var ms = m.Data.Messages.Ms;
            for (var i = 0; i < ms.length; i++) {
                tv.update(ms[i]);
            }
            tv.open();
            return;
        case "message":
            var d = m.Data.Message
            vs = ui.threads[d.ThreadId];
            if (!vs) return;
            for (var k in vs) {
                vs[k].update(d);
            }
        }
    }
};

Yoneda.UI.prototype.send = function(m) {
    if (Yoneda.debug) console.log("<<", m);
    this.socket.send(JSON.stringify(m));
};

////////////////////////////////////////////////////////////////////////////////

Yoneda.View = function(config) {
    this.el = config.el;
    this.$el = $(this.el);
    this.container = config.container;
    this.$container = $(this.container);
};

Yoneda.View.prototype.open = function() {
    this.$container.children().detach();
    this.append();
};

Yoneda.View.prototype.append = function() {
    var $c = this.$container;
    if ($c.css("display") === "none") $c.show();
    $c.append(this.el);
};

Yoneda.View.prototype.prepend = function() {
    var $c = this.$container;
    if ($c.css("display") === "none") $c.show();
    $c.prepend(this.el);
};

Yoneda.View.prototype.close = function() {
    this.$el.detach();
    var $c = this.$container;
    if (Yoneda.Util.isEmpty($c)) $c.hide();
};

Yoneda.View.prototype.isOpen = function() {
    return $.contains(this.container, this.el)
}

////////////////////////////////////////////////////////////////////////////////
    
Yoneda.LoginView = function(config) {
    config.el = Yoneda.Util.parseHTML(Yoneda.LoginView.tmpl);
    Yoneda.View.call(this, config);

    var $el = this.$el;
    this.$info = $el.find(".info");

    var $name = $el.find(".name");
    var $pass = $el.find(".pass");
    var $again = $el.find(".again");
    var $submit = $el.find(".submit");
    var $toggle = $el.find(".toggle");

    var lv = this;
    function login() {
        ui.send({
            Action: "login",
            Data: {
                Login: {
                    Name: $name.val(),
                    Pass: $pass.val(),
                },
            },
        });
    }
    function register() {
        if ($pass.val().length < 6) {
            lv.flash("password must be at least 6 characters");
            return;
        }
        if ($pass.val() !== $again.val()) {
            lv.flash("the two passwords don't match");
            return;
        }
        ui.send({
            Action: "register",
            Data: {
                Register: {
                    Name: $name.val(),
                    Pass: $pass.val(),
                },
            },
        });
    }

    $submit.click(function() {
        switch ($submit.val()) {
        case "login":
            login();
            break;
        case "register":
            register();
            break;
        }
    });

    $.each([$name, $pass, $again], function(i, o) {
        o.keypress(function(e) {
            if (e.keyCode == 13) $submit.click();
        });
    });

    $again.prop("disabled", true);
    $again.css("opacity", 0);

    $toggle.click(function() {
        if ($submit.val() === "login") {
            $submit.val("register");
            $toggle.val("already registered?");
            $again.prop("disabled", false);
            $again.animate({opacity: 1}, 100);
        } else {
            $submit.val("login");
            $toggle.val("need to register?");
            $again.prop("disabled", true);
            $again.animate({opacity: 0}, 100);
        }
    });
};

Yoneda.LoginView.prototype = Object.create(Yoneda.View.prototype);

Yoneda.LoginView.prototype.flash = function(i) {
    this.$info.html(i);
};

Yoneda.LoginView.tmpl = [
    '<div class="login">',
    '    <div class="content">',
    '        <img src="yoneda.png" class="logo fl">',
    '        <header>',
    '            <h1>Yoneda</h1>',
    '            <h2>Fully faithful communication of mathematics, finally.</h2>',
    '        </header>',
    '',
    '        <div class="info"></div>',
    '',
    '        <input class="name input" type="text" placeholder="username"',
    '               autocomplete="off" spellcheck="false">',
    '        <input class="pass input" type="password" placeholder="password"',
    '               autocomplete="off">',
    '        <input class="again input" type="password" placeholder="retype password"',
    '               autocomplete="off">',
    '        <div class="item">',
    '            <input class="submit input" type="button" value="login">',
    '            <input class="toggle input" type="button" value="need to register?">',
    '        </div>',
    '    </div>',
    '</div>',
].join('\n');

////////////////////////////////////////////////////////////////////////////////

Yoneda.AppView = function(config) {
    config.el = Yoneda.Util.parseHTML(Yoneda.AppView.tmpl);
    config.key = Yoneda.AppView.key;
    Yoneda.View.call(this, config);

    var $el = this.$el;

    this.main = $el.find(".main")[0];
    
    this.open();

    var nv = new Yoneda.NewThreadView({container: this.main});
    $el.find(".nav_item_start").click(function() { nv.open(); });

    var tv = this.threadListView =
        new Yoneda.ThreadListView({container: this.main});
    $el.find(".nav_item_threads").click(function() { tv.open(); });
    tv.open();
};

Yoneda.AppView.prototype = Object.create(Yoneda.View.prototype);

Yoneda.AppView.tmpl = [
    '<div class="app grid">',
    '    <div class="nav col col-1-3">',
    '        <img src="yoneda.png" class="logo">',
    '        <div class="nav_panes sec">',
    '            <div class="nav_title">Navigation</div>',
    '            <div class="nano">',
    '                <ul class="nano-content">',
    '                    <li class="nav_item_threads">',
    '                        <div class="label">Threads</div>',
    '                    </li>',
    '                    <li class="nav_item_start">',
    '                        <div class="label">Start new</div>',
    '                    </li>',
    '                </ul>',
    '            </div>',
    '        </div>',
    '        <div class="nav_threads sec">',
    '            <div class="nav_title">Open threads</div>',
    '        </div>',
    '        <div class="nav_notifs sec">',
    '            <div class="nav_title">Notifications</div>',
    '        </div>',
    '    </div>',
    '    <div class="main col col-2-3"></div>',
    '</div>',
].join('\n');

////////////////////////////////////////////////////////////////////////////////

Yoneda.inputTmpl = [
    '<div class="message-input sec">',
    '    <div class="live"></div>',
    '    <div class="area">',
    '        <textarea placeholder="Write a message..."></textarea>',
    '    </div>',
    '    <div class="options">',
    '        <input class="send input fl" type="button" value="send">',
    '        <input class="preview input fl" type="button" value="preview">',
    '        <input class="md input active fr" type="button" value="Markdown">',
    '        <input class="tex input active fr" type="button" value="TeX">',
    '    </div>',
    '</div>',
].join('\n');

Yoneda.setupInput = function($el, onSend) {
    var $input = $el.find(".message-input");

    var $live = $input.find(".live");
    var $area = $input.find(".area");
    var $areaText = $area.find("textarea");
    var $send = $input.find(".send");
    var $preview = $input.find(".preview");
    var $tex = $input.find(".tex");
    var $md = $input.find(".md");

    $area.keydown(function(e) {
        if (e.shiftKey && e.keyCode == 13) {
            e.preventDefault()
            onSend();
        }
    });
    $send.click(onSend);

    function liveUpdate() {
        var md = $md.hasClass("active");
        var tex = $tex.hasClass("active");
        $live.html(Yoneda.Util.Text.fmt($areaText.val(), md, tex));
        if (tex) Yoneda.Util.jax($live);
    }
    var timeout = 0;
    $preview.click(function() {
        $area.toggleClass("half");
        if ($preview.hasClass("active")) {
            $areaText.unbind("input propertychange");
        } else {
            $areaText.bind("input propertychange", function() {
                clearTimeout(timeout);
                timeout = setTimeout(liveUpdate, 500);
            });
        }
    });
    $.each([$preview, $tex, $md], function(i, o) {
        o.click(function() {
            o.toggleClass("active");
            if ($preview.hasClass("active")) liveUpdate();
            $areaText.focus();
        });
    });
};

////////////////////////////////////////////////////////////////////////////////

Yoneda.NewThreadView = function(config) {
    config.el = Yoneda.Util.parseHTML(Yoneda.NewThreadView.tmpl);
    Yoneda.View.call(this, config);

    var $el = this.$el;
    var $name = $el.find(".name");
    var $users = $el.find(".users");
    var $input = $el.find(".message-input");
    var $area = $input.find(".area");
    var $areaText = $area.find("textarea");
    var $tex = $input.find(".tex");
    var $md = $input.find(".md");

    function onSend() {
        var users = [];
        var names = $users.val().split(" ");
        for (var i = 0; i < names.length; i++) {
            users.push({Name: names[i]});
        }
        var message = {
            Body: $areaText.val(),
            Tex: $tex.hasClass("active"),
            Markdown: $md.hasClass("active"),
        };
        ui.send({
            Action: "newThread",
            Data: {
                NewThread: {
                    Name: $name.val(),
                    Users: users,
                    LastMessage: message,
                }
            },
        });
    }

    Yoneda.setupInput($el, onSend);
};

Yoneda.NewThreadView.prototype = Object.create(Yoneda.View.prototype);


Yoneda.NewThreadView.tmpl = [
    '<div class="new-thread">',
    '    <header class="sec">',
    '        <h1>Start a new thread</h1>',
    '    </header>',
    '    <div class="form sec">',
    '        <input class="name input" type="text" placeholder="thread title"',
    '               autocomplete="off" spellcheck="false">',
    '        <input class="users input" type="text" placeholder="recipients"',
    '               autocomplete="off" spellcheck="false">',
    '    </div>',
    '',
    Yoneda.inputTmpl,
    '',
    '</div>',
].join('\n');


////////////////////////////////////////////////////////////////////////////////

Yoneda.ThreadListView = function(config) {
    config.el = Yoneda.Util.parseHTML(Yoneda.ThreadListView.tmpl);
    Yoneda.View.call(this, config);

    ui.send({Action: "threadList"});
};

Yoneda.ThreadListView.prototype = Object.create(Yoneda.View.prototype);

Yoneda.ThreadListView.prototype.add = function(t) {
    var iv = new Yoneda.ThreadListItemView({
        container: this.$el.find("ul")[0],
        thread: t,
    });
    iv.append();
}

Yoneda.ThreadListView.key = "threadList";

Yoneda.ThreadListView.tmpl = [
    '<div class="thread-list">',
    '    <header class="sec">',
    '        <h1>Threads</h1>',
    '    </header>',
    '    <ul class="sec"></ul>',
    '</div>',
].join('\n');

////////////////////////////////////////////////////////////////////////////////

Yoneda.ThreadListItemView = function(config) {
    this.thread = config.thread;
    config.el = Yoneda.Util.parseHTML(
        Yoneda.ThreadListItemView.tmpl(this.thread)
    );
    Yoneda.View.call(this, config);

    this.update(this.thread.LastMessage);

    var thread = this.thread;
    var id = thread.Id;
    Yoneda.Util.mapAdd(ui.threads, id, Yoneda.ThreadListItemView.key, this);
    this.$el.click(function() {
        var av = ui.appView;
        var tv = ui.threads[id][Yoneda.ThreadView.key] ||
            new Yoneda.ThreadView({
                container: av.main,
                thread: thread,
            });
        tv.open();
    });
};

Yoneda.ThreadListItemView.prototype = Object.create(Yoneda.View.prototype);

Yoneda.ThreadListItemView.prototype.update = function(m) {
    m.Time = Yoneda.Util.fmtTime(m.Time, "d, t");
    this.$el.find(".message").html(
        Yoneda.ThreadListItemView.msgTmpl(m)
    );
}

Yoneda.ThreadListItemView.key = "list";

Yoneda.ThreadListItemView.tmpl = _.template([
    '<li class="grid">',
    '    <div class="col col-1-2">',
    '        <div class="title"><%= Name %></div>',
    '        <div class="users">',
    '        <% for (var i = 0; i < Users.length; i++) { %>',
    '        <%     print(Users[i].Name + " "); %>',
    '        <% } %>',
    '        </div>',
    '    </div>',
    '    <div class="col col-1-2">',
    '        <div class="message">',
    '        </div>',
    '    </div>',
    '</div>',
].join('\n'));

Yoneda.ThreadListItemView.msgTmpl = _.template([
    '<time class="time fr"><%= Time %></time>',
    '<div class="author"><%= Author %></div>',
    '<div class="body"><%= Body %></div>',
].join('\n'));

////////////////////////////////////////////////////////////////////////////////

Yoneda.ThreadView = function(config) {
    this.thread = config.thread;
    config.el = Yoneda.Util.parseHTML(
        Yoneda.ThreadView.tmpl(this.thread)
    );
    Yoneda.View.call(this, config);

    var thread = this.thread;
    Yoneda.Util.mapAdd(ui.threads, thread.Id, Yoneda.ThreadView.key, this);
    ui.send({
        Action: "messages",
        Data: {
            Messages: {ThreadId: thread.Id},
        },
    });
};

Yoneda.ThreadView.prototype = Object.create(Yoneda.View.prototype);

Yoneda.ThreadView.prototype.update = function(m) {
    m.Time = Yoneda.Util.fmtTime(m.Time, "d, t");
    this.$el.find(".messages").append(
        Yoneda.Util.parseHTML(Yoneda.ThreadView.messageTmpl(m))
    );
}

Yoneda.ThreadView.key = "thread";

Yoneda.ThreadView.tmpl = _.template([
    '<div class="thread">',
    '    <header class="sec">',
    '        <h1><%= Name %></h1>',
    '        <h2>',
    '        <% for (var i = 0; i < Users.length; i++) { %>',
    '        <%     print(Users[i].Name + " "); %>',
    '        <% } %>',
    '        </h2>',
    '    </header>',
    '    <div class="messages sec"></div>',
    Yoneda.inputTmpl,
    '    </div>',
].join('\n'));

Yoneda.ThreadView.messageTmpl = _.template([
    '<div class="message">',
    '    <time class="time fr"><%= Time %></time>',
    '    <div class="author"><%= Author %></div>',
    '    <div class="body">',
    '        <%= Body %>',
    '    </div>',
    '</div>',
].join('\n'));

////////////////////////////////////////////////////////////////////////////////

ui = new Yoneda.UI;
