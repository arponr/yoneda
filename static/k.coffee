################################################################################
# UTILS
################################################################################

relurl = -> window.location.href.toString().split(window.location.host)[1]

class TextUtil
    @reCensor: /\$\$[^\$]+\$\$|\$[^\$]+\$/gm
    @reUncensor: /\$(\d+)\$/gm

    @format = (text, markdown, tex) ->
        if markdown
            return @texdown(text, tex)
        else
            return @escape(text)

    @escape = (text) ->
        text

    @texdown = (text, tex) ->
        if tex
            math = []
            replCensor = (match) ->
                math.push(match)
                return "$#{math.length - 1}$"
            replUncensor = (match, ind, offset, string) ->
                return math[parseInt(ind)]
            censored = text.replace(@reCensor, replCensor)
            html = markdown.toHTML(censored)
            return html.replace(@reUncensor, replUncensor)
        else
            return markdown.toHTML(text)

unwrapJQuery = (f) ->
    return (el) -> f(if el instanceof jQuery then el[0] else el)

mathjaxTypeset = unwrapJQuery (el) ->
    MathJax.Hub.Queue ["Typeset", MathJax.Hub, el]

scrollBottom = unwrapJQuery (el) ->
    return el.scrollHeight - el.offsetHeight

scroll = ($el) -> $el.scrollTop(scrollBottom($el))

scrollIfAtBottom = ($el, jax, cb=->) ->
    atBottom = $el.scrollTop() == scrollBottom($el)
    cb()
    if atBottom
        if jax then MathJax.Hub.Queue(-> scroll($el)) else scroll($el)

websocket = (url) ->
    url = location.origin + url
    return new WebSocket(url.replace(/^http/, "ws").replace("thread", "socket"))

lowerKeys = (a) ->
    if typeof a != "object"
        return a
    b = {}
    for k, v of a
        l = k.charAt(0).toLowerCase() + k.slice(1)
        b[l] = lowerKeys(v)
    return b

prezero = (x) -> return if x < 10 then "0" + x else x

fmtTime = (stamp, fmt) ->
    obj = new Date(stamp)
    date = do (obj) ->
        y = obj.getFullYear()
        m = prezero(obj.getMonth() + 1)
        d = prezero(obj.getDate())
        return "#{y}-#{m}-#{d}"
    time = do (obj) ->
        h = obj.getHours()
        m = prezero(obj.getMinutes())
        p = "am"
        if h == 0
            h = 12
        else if h > 12
            h -= 12
            p = "pm"
        return "#{h}:#{m}#{p}"
    return fmt.replace("d", date).replace("t", time)

################################################################################
# MODELS
################################################################################


class CTModel extends Backbone.Model
    @defineAttributes: (attrs...) ->
        for k in attrs
            do (k) =>
                Object.defineProperty(@prototype, k, {
                    get: -> return @get(k)
                    set: (v) -> @set(k, v)
                })
        return

    toJSON: (timeFmt="") ->
        json = super
        if @time
            json.time = fmtTime(@time, timeFmt)
        return json

#-------------------------------------------------------------------------------

class Message extends CTModel
    @defineAttributes("username", "rawBody", "fmtBody", "markdown", "tex",
        "time")

#-------------------------------------------------------------------------------

class MessageList extends Backbone.Collection
    model: Message

#-------------------------------------------------------------------------------

class Thread extends CTModel
    @defineAttributes("name", "users", "time", "last", "messages")

    defaults:
        messages: new MessageList()

    initialize: ->
        @socket = websocket("/thread/#{@id}")
        @socket.onmessage = (e) =>
            m = lowerKeys(JSON.parse(e.data))
            @messages.add(new Message(m))

    toJSON: ->
        json = super
        json.users = (v for k,v of @users).join(", ")
        return json

    getData: (cb=->) ->
        $.getJSON("/data/thread/#{@id}", (data) =>
            data = lowerKeys(data)
            @.set(data)
            cb())

    getMessages: (cb=->) ->
        @messages.reset()
        $.getJSON("/data/threadmsgs/#{@id}", (data) =>
            if data
                for pt in data
                    pt = lowerKeys(pt)
                    @messages.add(new Message(pt))
            cb())

#-------------------------------------------------------------------------------

class ThreadList extends Backbone.Collection
    model: Thread

    getData: (cb=->) ->
        $.getJSON("/data/threadlist", (data) =>
            for pt in data
                pt = lowerKeys(pt)
                @.add(new Thread(pt))
            cb())


################################################################################
# VIEWS
################################################################################

ui = null

inputTemplate = """
    <div class="message-input">
        <div class="preview-pane"></div>
        <div class="icon down">&#59232;</div>
        <textarea class="message-area" name="message"
            placeholder="Write a message...">
        </textarea>
        <div class="message-options">
            <input class="send-button" type="button" value="send">
            <input class="preview-button" type="button" value="preview">
            <label class="check">
                <input class="markdown-check" type="checkbox" checked="checked">
                <span class="checklabel">markdown</span>
            </label>
            <label class="check">
                <input class="tex-check" type="checkbox" checked="checked">
                <span class="checklabel">TeX</span>
            </label>
        </div>
    </div>
"""

#-------------------------------------------------------------------------------

class CTView extends Backbone.View
    show: =>
        if ui.cur[@type]
            ui.cur[@type].$el.hide()
        ui.cur[@type] = @
        @$el.show()

    hide: =>
        if ui.cur[@type] == @
            ui.cur[@type] = null
            @$el.hide()

    toggle: =>
        if ui.cur[@type] == @ then @hide() else @show()

#-------------------------------------------------------------------------------

class NewThreadView extends CTView
    type: "side-left"

    className: "new-thread-view"

    template: """
        <header>
            <h1>Start a new thread</h1>
        </header>
        <form class="new-thread-form" action="/newthread" method="POST">
            <input class="new-thread-input" type="text" name="name"
                placeholder="thread name"
                autocomplete="off" spellcheck="false">
            <input class="new-thread-input" type="text" name="users"
                placeholder="recipients (space-separated usernames)"
                autocomplete="off" spellcheck="false">
            #{inputTemplate}
        </form>
    """

    render: ->
        @$el.html(@template)
        $newThreadForm = @$(".new-thread-form")
        $previewPane = @$(".preview-pane")
        $messageArea = @$(".message-area")
        $sendButton = @$(".send-button")
        $previewButton = @$(".preview-button")
        $markdownCheck = @$(".markdown-check")
        $texCheck = @$(".tex-check")

        onSend = -> $newThreadForm.submit()
        $messageArea.keydown (e) ->
            if e.shiftKey and e.keyCode == 13
                onSend()
                e.preventDefault()
        $sendButton.click(onSend)

        updatePreview = ->
            markdown = $markdownCheck.prop("checked")
            tex = $texCheck.prop("checked")
            $previewPane.html(
                TextUtil.format($messageArea.val(), markdown, tex))
            if tex
                mathjaxTypeset($previewPane)
        previewPaneOpen = false
        timeout = 0
        $previewButton.click ->
            if previewPaneOpen
                $messageArea.animate({top: "0"}, 150)
                $messageArea.unbind("input propertychange")
            else
                $messageArea.animate({top: $previewPane.outerHeight()}, 150)
                updatePreview()
                $messageArea.bind("input propertychange", ->
                    clearTimeout(timeout)
                    timeout = setTimeout(updatePreview, 500))
            previewPaneOpen = !previewPaneOpen

        return @

#-------------------------------------------------------------------------------

class MessageListItemView extends Backbone.View
    initialize: (options) ->
        @message = options.message

    template: _.template("""
        <div class="msg">
            <div class="aside">
                <time><%= time %></time>
            </div>
            <div class="username"><%= username %></div>
            <div class="body fmt <%if (tex) print("math"); %>">
                <%= fmtBody %>
            </div>
            <% if (markdown || tex) { %>
            <div class="body raw">
                <%= rawBody %>
            </div>
            <% } %>
        </div>
    """)

    render: ->
        @$el.html(@template(@message.toJSON("d, t")))
        if @message.tex
            mathjaxTypeset(@el)
        return @

#-------------------------------------------------------------------------------

class MessageListView extends Backbone.View
    initialize: (options) ->
        @messages = options.messages or new MessageList()
        @messages.on("add", @renderMessage, @)

    render: ->
        @messages.forEach (message) => @renderMessage(message)
        return @

    renderMessage: (message) ->
        messageView = new MessageListItemView({message: message})
        scrollIfAtBottom(@$el, message.tex, =>
            @$el.append(messageView.render().el))

#-------------------------------------------------------------------------------

class ThreadView extends CTView
    type: "main"

    initialize: (options) ->
        @thread = options.thread

    template: _.template("""
        <header>
            <h1><%= name %></h1>
            <h2><%= users %></h2>
        </header>
        <div class="messages"></div>
        #{inputTemplate}
    """)

    render: ->
        @$el.html(@template(@thread.toJSON()))
        @$messagesEl = @$(".messages")
        $previewPane = @$(".preview-pane")
        $messageArea = @$(".message-area")
        $sendButton = @$(".send-button")
        $previewButton = @$(".preview-button")
        $markdownCheck = @$(".markdown-check")
        $texCheck = @$(".tex-check")

        @thread.getMessages =>
            messagesView = new MessageListView(
                messages: @thread.messages
                el: @$messagesEl
            ).render()


        onSend = -> $newThreadForm.submit()
        $messageArea.keydown (e) ->
            if e.shiftKey and e.keyCode == 13
                onSend()
                e.preventDefault()
        $sendButton.click(onSend)

        updatePreview = ->
            markdown = $markdownCheck.prop("checked")
            tex = $texCheck.prop("checked")
            $previewPane.html(
                TextUtil.format($messageArea.val(), markdown, tex))
            if tex
                mathjaxTypeset($previewPane)
        previewPaneOpen = false
        timeout = 0
        $previewButton.click ->
            if previewPaneOpen
                $messageArea.animate({top: "0"}, 150)
                $messageArea.unbind("input propertychange")
            else
                $messageArea.animate({top: $previewPane.outerHeight()}, 150)
                updatePreview()
                $messageArea.bind("input propertychange", ->
                    clearTimeout(timeout)
                    timeout = setTimeout(updatePreview, 500))
            previewPaneOpen = !previewPaneOpen

        return @


        hidePreview = (b) ->
            prevPane.html("")
            down.hide(150)
            prevPane.animate({bottom: "30px"}, 150)
            if b
                @messagesEl.animate({bottom: "135px"}, 150)
            else
                @messagesEl.animate({
                    bottom: "135px",
                    scrollTop: @messagesEl.scrollTop() - 100
                }, 150)

        onsend = =>
            m =
                "RawBody": msgInput.val()
                "Markdown": mdCheck.is(":checked")
                "Tex": texCheck.is(":checked")
            msgInput.val("")
            if prevPane.css("bottom") == "120px"
                hidePreview(true)
            @thread.socket.send(JSON.stringify(m))

        msgInput.keydown (e) ->
            if e.shiftKey and e.keyCode == 13
                onsend()
                e.preventDefault()

        send.click(onsend)

        preview.click ->
            mc = mdCheck.is(":checked")
            tc = texCheck.is(":checked")
            m =
                "raw": msgInput.val()
                "markdown": if mc then "md" else ""
                "tex": if tc then "tex" else ""
            prevPane.load("/preview", m, ->
                if tc
                    mathjaxTypeset(prevPane[0])
                if prevPane.css("bottom") == "30px"
                    down.show(150)
                    prevPane.animate({bottom: "120px"}, 150)
                    @messagesEl.animate({
                        bottom: "235px",
                        scrollTop: @messagesEl.scrollTop() + 100
                    }, 150))

        down.click -> hidePreview(false)

        return @

#-------------------------------------------------------------------------------

class ThreadListItemView extends Backbone.View
    className: "item"

    initialize: (options) ->
        @thread = options.thread
        @thread.messages.on("add", @render, @)
        @threadView = null

    template: _.template("""
        <time><%= time %></time>
        <div class="name"><%= name %></div>
        <div class="users"><%= users %></div>
        <% if (last) { %>
        <div class="lastmsg">
            <%= last.username %>: <%= last.fmtBody %>
        </div>
        <% } %>
    """)

    render: ->
        @$el.html(@template(@thread.toJSON("d<br>t")))
        return @

    events:
        "click": "showThreadView"

    showThreadView: =>
        if !@threadView
            @threadView = ui.addView(ThreadView, {thread: @thread}).render()
        @threadView.show()

#-------------------------------------------------------------------------------

class ThreadListView extends CTView
    type: "side-right"

    initialize: (options) ->
        @threads = options.threads

    render: ->
        @threads.forEach (thread) =>
            itemView = new ThreadListItemView(thread: thread)
            @$el.append(itemView.render().el)
        return @

#-------------------------------------------------------------------------------

class UI extends Backbone.View
    template: """
        <nav class="controls">
            <div class="icon right notify">&#8962;</div>
            <div class="icon left settings">&#9881;</div>
            <div class="icon left addthread">&#59160;</div>
        </nav>
        <div class="side-left"></div>
        <div class="main"></div>
        <div class="side-right"></div>
    """

    render: ->
        @$el.html(@template)
        @cur = {}

        $notifyIcon = @$(".icon.notify")
        $settingsIcon = @$(".icon.settings")
        $newThreadIcon = @$(".icon.addthread")

        newThreadView = @addView(NewThreadView).render()
        $newThreadIcon.click ->
            $newThreadIcon.toggleClass("active")
            newThreadView.toggle()

        threads = new ThreadList()
        threads.getData(=>
            threadListView = @addView(ThreadListView, {threads: threads}).render()
            threadListView.show()
            $notifyIcon.click(threadListView.show))

        return @

    addView: (viewType, options={}) ->
        options.className = "view " +
            (options.className or viewType.prototype.className or "")
        view = new viewType(options)
        @$(".#{viewType.prototype.type}").append(view.el)
        return view

#-------------------------------------------------------------------------------

loadThread = ->
    panel = buildPanel()
    threadId = relurl().substring("/thread/".length)
    $.getJSON "/data/thread/#{threadId}", (thread) ->
        buildThread(panel, thread, ->
            flip(threadKey(threadId))
            $(document.body).append(panel))

#-------------------------------------------------------------------------------

loadRoot = ->
    MathJax.Hub.Config(
        tex2jax:
            inlineMath: [["$","$"]]
            processClass: "math"
            ignoreClass: "nomath"
        "HTML-CSS":
            scale: 95
            availableFonts: []
            webFont: "Gyre-Termes")

    ui = new UI(el: $(document.body))
    ui.render()

#-------------------------------------------------------------------------------

loadLogin = ->
    sw = $("#switch")
    login = $("#login")
    submit = $("#submit")
    again = $("#again")
    sw.click ->
        if again.is(":visible")
            submit.val("login")
            login.attr(action: "/login")
            sw.val("need to register?")
            again.hide()
        else
            submit.val("register")
            login.attr(action: "/register")
            sw.val("already have an account?")
            again.show()

#-------------------------------------------------------------------------------

load =
    "loginpage": loadLogin
    "rootpage": loadRoot
    "threadpage": loadThread

jQuery -> load[document.body.id]()
