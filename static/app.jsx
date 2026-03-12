const { useEffect, useRef, useState } = React;

const TORONTO_TIMEZONE = window.APP_CONFIG.torontoTimezone;

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
    });

    const contentType = response.headers.get("content-type") || "";
    let payload;
    if (contentType.includes("application/json")) {
        payload = await response.json();
    } else {
        payload = await response.text();
    }

    if (!response.ok) {
        const message =
            payload?.error ||
            (response.status === 413
                ? "Photo upload is too large. Keep it under 25 MB."
                : "Request failed.");
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return payload;
}

function formatTorontoTime(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatTorontoDate(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIMEZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatTimestamp(value) {
    if (!value) {
        return "Never";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIMEZONE,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

function getTorontoDayKey(value) {
    if (!value) {
        return "";
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(parsed);
}

function formatTimelineDayHeading(value) {
    if (!value) {
        return "Unknown day";
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIMEZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(parsed);
}

function groupPostsByDay(posts) {
    const groups = [];

    posts.forEach((post) => {
        const dayKey = getTorontoDayKey(post.created_at);
        const previousGroup = groups[groups.length - 1];

        if (previousGroup && previousGroup.key === dayKey) {
            previousGroup.posts.push(post);
            return;
        }

        groups.push({
            key: dayKey,
            label: formatTimelineDayHeading(post.created_at),
            posts: [post],
        });
    });

    return groups;
}

function formatMetric(value, suffix) {
    if (value === null || value === undefined) {
        return "—";
    }
    return `${value}${suffix}`;
}

function LoginScreen({ busy, error, onSubmit }) {
    const [selectedUser, setSelectedUser] = useState("victoria");
    const [password, setPassword] = useState("");

    function handleSubmit(event) {
        event.preventDefault();
        onSubmit(selectedUser, password);
    }

    const people = [
        { id: "victoria", name: "Victoria" },
        { id: "raza", name: "Raza" },
    ];

    return (
        <div className="login-shell">
            <div className="login-card">
                <p className="eyebrow">Household Pet Journal</p>
                <h1>Sign in to the timeline</h1>
                <p className="lede">
                    Pick your profile, enter your password, and post updates for the
                    pets from one shared feed.
                </p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="user-switcher">
                        {people.map((person) => (
                            <button
                                key={person.id}
                                type="button"
                                className={`switch-pill ${
                                    selectedUser === person.id ? "active" : ""
                                }`}
                                onClick={() => setSelectedUser(person.id)}
                            >
                                {person.name}
                            </button>
                        ))}
                    </div>

                    <label className="field">
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter password"
                            autoComplete="current-password"
                            required
                        />
                    </label>

                    {error ? <div className="error-banner">{error}</div> : null}

                    <button className="primary-button large" type="submit" disabled={busy}>
                        {busy ? "Signing in..." : "Enter app"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function TaskPanel({
    tasks,
    noteValues,
    activeTask,
    onNoteChange,
    onLogTask,
    collapsed,
    onToggle,
}) {
    return (
        <aside className={`panel left-panel ${collapsed ? "is-collapsed" : ""}`}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Quick Tasks</p>
                    <h2>Care queue</h2>
                </div>

                <div className="panel-header-actions">
                    <button
                        className="secondary-button panel-toggle"
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={onToggle}
                    >
                        {collapsed ? "Expand" : "Collapse"}
                    </button>
                </div>
            </div>

            {collapsed ? (
                <div className="collapsed-preview">
                    {tasks.length
                        ? `${tasks.length} quick actions ready`
                        : "Quick actions are loading"}
                </div>
            ) : (
                <div className="panel-body">
                    <div className="task-list">
                        {tasks.map((task) => (
                            <section className="task-card" key={task.id}>
                                <div className="task-row">
                                    <div>
                                        <h3>{task.label}</h3>
                                        <p className="muted">
                                            Last logged: {formatTimestamp(task.last_completed_at)}
                                        </p>
                                    </div>

                                    <button
                                        className="primary-button"
                                        type="button"
                                        disabled={activeTask === task.id}
                                        onClick={() => onLogTask(task.id)}
                                    >
                                        {activeTask === task.id ? "Saving..." : "Log now"}
                                    </button>
                                </div>

                                <label className="field compact">
                                    <span>Optional note</span>
                                    <textarea
                                        rows="3"
                                        placeholder="Anything worth noting?"
                                        value={noteValues[task.id] || ""}
                                        onChange={(event) =>
                                            onNoteChange(task.id, event.target.value)
                                        }
                                    />
                                </label>
                            </section>
                        ))}
                    </div>
                </div>
            )}
        </aside>
    );
}

function TimelineItem({
    post,
    isEditing,
    editText,
    editPhoto,
    editRemovePhoto,
    editFileRef,
    savingEdit,
    deletingId,
    onStartEdit,
    onCancelEdit,
    onEditTextChange,
    onEditPhotoChange,
    onToggleRemovePhoto,
    onSaveEdit,
    onDelete,
    commentDraft,
    commentBusy,
    reactionBusyKey,
    onCommentDraftChange,
    onSubmitComment,
    onToggleReaction,
}) {
    const isTask = post.post_type === "task";
    const hasBeenEdited = post.updated_at !== post.created_at;
    const reactions = post.reactions || [];
    const comments = post.comments || [];

    return (
        <article className={`post-card ${isTask ? "task-post" : ""}`}>
            <div className="post-topline">
                <span className="post-kind">
                    {isTask ? `${post.task_label} logged` : "Pet update"}
                </span>
                <span className="post-time">
                    {formatTimestamp(post.created_at)}
                    {hasBeenEdited ? " · edited" : ""}
                </span>
            </div>

            <div className="post-header">
                <div>
                    <h3>{post.author_name}</h3>
                    <p className="muted">
                        {isTask
                            ? `Task completed in Toronto`
                            : `Shared from the household timeline`}
                    </p>
                </div>
            </div>

            {isEditing ? (
                <form
                    className="edit-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSaveEdit(post);
                    }}
                >
                    <label className="field compact">
                        <span>{isTask ? "Notes" : "Update text"}</span>
                        <textarea
                            rows="4"
                            value={editText}
                            onChange={(event) => onEditTextChange(event.target.value)}
                            placeholder={
                                isTask
                                    ? "Add or update notes"
                                    : "Update the text for this post"
                            }
                        />
                    </label>

                    {post.image_url ? (
                        <label className="checkbox-row">
                            <input
                                type="checkbox"
                                checked={editRemovePhoto}
                                onChange={(event) =>
                                    onToggleRemovePhoto(event.target.checked)
                                }
                            />
                            <span>Remove current photo</span>
                        </label>
                    ) : null}

                    <label className="file-pill">
                        {post.image_url ? "Replace photo" : "Add photo"}
                        <input
                            ref={editFileRef}
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                                onEditPhotoChange(event.target.files?.[0] || null)
                            }
                        />
                    </label>

                    {editPhoto ? (
                        <div className="file-chip">{editPhoto.name}</div>
                    ) : null}

                    <div className="card-actions">
                        <button
                            className="primary-button"
                            type="submit"
                            disabled={savingEdit}
                        >
                            {savingEdit ? "Saving..." : "Save changes"}
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            disabled={savingEdit}
                            onClick={onCancelEdit}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    <div className="post-content">
                        {post.content ? (
                            <p>{post.content}</p>
                        ) : isTask ? (
                            <p className="empty-copy">
                                Completed without extra notes.
                            </p>
                        ) : null}

                        {post.image_url ? (
                            <img
                                className="post-image"
                                src={post.image_url}
                                alt="Pet update"
                            />
                        ) : null}
                    </div>

                    <div className="post-engagement">
                        <div className="reaction-row">
                            {reactions.map((reaction) => {
                                const busyKey = `${post.id}:${reaction.id}`;
                                return (
                                    <button
                                        key={reaction.id}
                                        className={`reaction-chip ${
                                            reaction.reacted ? "active" : ""
                                        }`}
                                        type="button"
                                        title={reaction.label}
                                        disabled={reactionBusyKey === busyKey}
                                        onClick={() =>
                                            onToggleReaction(post.id, reaction.id)
                                        }
                                    >
                                        <span className="reaction-emoji">
                                            {reaction.emoji}
                                        </span>
                                        {reaction.count > 0 ? (
                                            <span>{reaction.count}</span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="comment-section">
                            {comments.length > 0 ? (
                                <div className="comment-list">
                                    {comments.map((comment) => (
                                        <div className="comment-item" key={comment.id}>
                                            <div className="comment-meta">
                                                <strong>{comment.author_name}</strong>
                                                <span className="muted">
                                                    {formatTimestamp(comment.created_at)}
                                                </span>
                                            </div>
                                            <p>{comment.content}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <form
                                className="comment-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    onSubmitComment(post.id);
                                }}
                            >
                                <label className="field compact comment-field">
                                    <span>Comment</span>
                                    <textarea
                                        rows="2"
                                        placeholder="Add a comment"
                                        value={commentDraft}
                                        onChange={(event) =>
                                            onCommentDraftChange(event.target.value)
                                        }
                                    />
                                </label>

                                <button
                                    className="secondary-button"
                                    type="submit"
                                    disabled={commentBusy}
                                >
                                    {commentBusy ? "Posting..." : "Comment"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {post.can_edit ? (
                        <div className="card-actions">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={() => onStartEdit(post)}
                            >
                                Edit
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                disabled={deletingId === post.id}
                                onClick={() => onDelete(post)}
                            >
                                {deletingId === post.id ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    ) : null}
                </>
            )}
        </article>
    );
}

function TimelineDaySection({ group, expanded, onToggle, children }) {
    const updateLabel = `${group.posts.length} ${
        group.posts.length === 1 ? "update" : "updates"
    }`;

    return (
        <section className={`timeline-day ${expanded ? "is-open" : ""}`}>
            <button
                className="timeline-day-toggle"
                type="button"
                aria-expanded={expanded}
                onClick={onToggle}
            >
                <div>
                    <p className="eyebrow">{updateLabel}</p>
                    <h3>{group.label}</h3>
                </div>
                <div className="timeline-day-meta">
                    <span>{expanded ? "Hide section" : "Show section"}</span>
                </div>
            </button>

            {expanded ? <div className="timeline-day-content">{children}</div> : null}
        </section>
    );
}

function InfoPanel({
    user,
    weather,
    now,
    onRefresh,
    onLogout,
    loading,
    collapsed,
    onToggle,
}) {
    return (
        <aside className={`panel right-panel ${collapsed ? "is-collapsed" : ""}`}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Toronto Live</p>
                    <h2>Info panel</h2>
                </div>

                <div className="panel-header-actions">
                    {!collapsed ? (
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    ) : null}
                    <button
                        className="secondary-button panel-toggle"
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={onToggle}
                    >
                        {collapsed ? "Expand" : "Collapse"}
                    </button>
                </div>
            </div>

            {collapsed ? (
                <div className="collapsed-preview">
                    Toronto {formatTorontoTime(now)}
                    {weather?.available ? ` · ${weather.condition}` : ""}
                </div>
            ) : (
                <div className="panel-body info-stack">
                    <section className="info-card standout">
                        <p className="eyebrow">Current Time</p>
                        <div className="clock-face">{formatTorontoTime(now)}</div>
                        <p className="muted">{formatTorontoDate(now)}</p>
                        <p className="tiny-note">Toronto, Ontario</p>
                    </section>

                    <section className="info-card">
                        <p className="eyebrow">Current Weather</p>
                        {weather?.available ? (
                            <>
                                <h3>{weather.condition}</h3>
                                <div className="metric-grid">
                                    <div>
                                        <span className="metric-label">Temp</span>
                                        <strong>{formatMetric(weather.temperature_c, "°C")}</strong>
                                    </div>
                                    <div>
                                        <span className="metric-label">Feels like</span>
                                        <strong>
                                            {formatMetric(weather.apparent_temperature_c, "°C")}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="metric-label">Wind</span>
                                        <strong>{formatMetric(weather.wind_kph, " km/h")}</strong>
                                    </div>
                                </div>
                                <p className="muted">
                                    Observed: {formatTimestamp(weather.observed_at)}
                                </p>
                            </>
                        ) : (
                            <>
                                <h3>Weather unavailable</h3>
                                <p className="muted">
                                    The app could not reach the weather service right now.
                                </p>
                            </>
                        )}
                    </section>

                    <section className="info-card user-card">
                        <p className="eyebrow">Signed In</p>
                        <h3>{user.display_name}</h3>
                        <p className="muted">@{user.username}</p>
                        <button
                            className="secondary-button full-width"
                            type="button"
                            onClick={onLogout}
                        >
                            Log out
                        </button>
                    </section>
                </div>
            )}
        </aside>
    );
}

function App() {
    const [sessionChecked, setSessionChecked] = useState(false);
    const [user, setUser] = useState(null);
    const [posts, setPosts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [weather, setWeather] = useState(null);
    const [now, setNow] = useState(new Date());

    const [loginBusy, setLoginBusy] = useState(false);
    const [loadingDashboard, setLoadingDashboard] = useState(false);
    const [authError, setAuthError] = useState("");
    const [actionError, setActionError] = useState("");

    const [composerText, setComposerText] = useState("");
    const [composerPhoto, setComposerPhoto] = useState(null);
    const [composeBusy, setComposeBusy] = useState(false);

    const [taskNotes, setTaskNotes] = useState({
        feed: "",
        litter_clean: "",
        dog_walk: "",
    });
    const [loggingTask, setLoggingTask] = useState("");
    const [tasksCollapsed, setTasksCollapsed] = useState(false);
    const [infoCollapsed, setInfoCollapsed] = useState(false);
    const [expandedDays, setExpandedDays] = useState({});
    const [visibleDayCount, setVisibleDayCount] = useState(3);
    const [commentDrafts, setCommentDrafts] = useState({});
    const [commentingId, setCommentingId] = useState(null);
    const [reactionBusyKey, setReactionBusyKey] = useState("");

    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState("");
    const [editPhoto, setEditPhoto] = useState(null);
    const [editRemovePhoto, setEditRemovePhoto] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const composerFileRef = useRef(null);
    const editFileRef = useRef(null);

    useEffect(() => {
        loadSession();
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!user) {
            setPosts([]);
            setTasks([]);
            setWeather(null);
            return undefined;
        }

        loadDashboard();

        const timer = window.setInterval(() => {
            loadWeather();
        }, 10 * 60 * 1000);

        return () => window.clearInterval(timer);
    }, [user]);

    useEffect(() => {
        if (posts.length === 0) {
            setExpandedDays((current) =>
                Object.keys(current).length === 0 ? current : {}
            );
            return;
        }

        const groupedPosts = groupPostsByDay(posts);
        setExpandedDays((current) => {
            const next = {};

            groupedPosts.forEach((group, index) => {
                const hasExistingValue = Object.prototype.hasOwnProperty.call(
                    current,
                    group.key
                );
                next[group.key] = hasExistingValue ? current[group.key] : index < 2;
            });

            const currentKeys = Object.keys(current);
            const nextKeys = Object.keys(next);
            const unchanged =
                currentKeys.length === nextKeys.length &&
                nextKeys.every((key) => current[key] === next[key]);

            return unchanged ? current : next;
        });
    }, [posts]);

    useEffect(() => {
        const totalDayCount = groupPostsByDay(posts).length;
        if (totalDayCount === 0) {
            setVisibleDayCount(3);
            return;
        }

        setVisibleDayCount((current) => {
            const next = Math.min(totalDayCount, Math.max(3, current));
            return current === next ? current : next;
        });
    }, [posts]);

    async function loadSession() {
        try {
            const payload = await apiFetch("/api/session");
            setUser(payload.user);
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setSessionChecked(true);
        }
    }

    async function loadDashboard() {
        setLoadingDashboard(true);
        setActionError("");
        try {
            const [postPayload, taskPayload, weatherPayload] = await Promise.all([
                apiFetch("/api/posts"),
                apiFetch("/api/tasks"),
                apiFetch("/api/weather"),
            ]);
            setPosts(postPayload.posts);
            setTasks(taskPayload.tasks);
            setWeather(weatherPayload);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoadingDashboard(false);
        }
    }

    async function loadTasks() {
        try {
            const payload = await apiFetch("/api/tasks");
            setTasks(payload.tasks);
        } catch (error) {
            handleApiError(error);
        }
    }

    async function loadWeather() {
        try {
            const payload = await apiFetch("/api/weather");
            setWeather(payload);
        } catch (error) {
            handleApiError(error);
        }
    }

    function handleApiError(error) {
        if (error.status === 401) {
            setUser(null);
            setActionError("");
            return;
        }
        setActionError(error.message);
    }

    async function handleLogin(username, password) {
        setLoginBusy(true);
        setAuthError("");
        try {
            const payload = await apiFetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
            });
            setUser(payload.user);
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setLoginBusy(false);
            setSessionChecked(true);
        }
    }

    async function handleLogout() {
        try {
            await apiFetch("/api/logout", { method: "POST" });
        } catch (error) {
            setActionError(error.message);
        } finally {
            setUser(null);
            setEditingId(null);
            setComposerText("");
            setComposerPhoto(null);
            setCommentDrafts({});
            setCommentingId(null);
            setReactionBusyKey("");
            if (composerFileRef.current) {
                composerFileRef.current.value = "";
            }
        }
    }

    async function handleCreatePost(event) {
        event.preventDefault();

        if (!composerText.trim() && !composerPhoto) {
            setActionError("Add some text or attach a photo.");
            return;
        }

        setComposeBusy(true);
        setActionError("");

        const formData = new FormData();
        formData.append("content", composerText);
        if (composerPhoto) {
            formData.append("photo", composerPhoto);
        }

        try {
            const payload = await apiFetch("/api/posts", {
                method: "POST",
                body: formData,
            });
            setPosts((current) => [payload.post, ...current]);
            setComposerText("");
            setComposerPhoto(null);
            if (composerFileRef.current) {
                composerFileRef.current.value = "";
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setComposeBusy(false);
        }
    }

    async function handleQuickLog(taskId) {
        setLoggingTask(taskId);
        setActionError("");

        try {
            const payload = await apiFetch("/api/quick-log", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    task: taskId,
                    notes: taskNotes[taskId] || "",
                }),
            });

            setPosts((current) => [payload.post, ...current]);
            setTasks((current) =>
                current.map((task) =>
                    task.id === taskId
                        ? { ...task, last_completed_at: payload.post.created_at }
                        : task
                )
            );
            setTaskNotes((current) => ({
                ...current,
                [taskId]: "",
            }));
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoggingTask("");
        }
    }

    async function handleToggleReaction(postId, reactionId) {
        const busyKey = `${postId}:${reactionId}`;
        setReactionBusyKey(busyKey);
        setActionError("");

        try {
            const payload = await apiFetch(`/api/posts/${postId}/reactions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reaction: reactionId }),
            });
            setPosts((current) =>
                current.map((entry) =>
                    entry.id === postId ? payload.post : entry
                )
            );
        } catch (error) {
            handleApiError(error);
        } finally {
            setReactionBusyKey("");
        }
    }

    async function handleSubmitComment(postId) {
        const content = (commentDrafts[postId] || "").trim();
        if (!content) {
            setActionError("Write a comment before posting.");
            return;
        }

        setCommentingId(postId);
        setActionError("");

        try {
            const payload = await apiFetch(`/api/posts/${postId}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ content }),
            });
            setPosts((current) =>
                current.map((entry) =>
                    entry.id === postId ? payload.post : entry
                )
            );
            setCommentDrafts((current) => ({
                ...current,
                [postId]: "",
            }));
        } catch (error) {
            handleApiError(error);
        } finally {
            setCommentingId(null);
        }
    }

    function startEditing(post) {
        setEditingId(post.id);
        setEditText(post.content || "");
        setEditPhoto(null);
        setEditRemovePhoto(false);
        if (editFileRef.current) {
            editFileRef.current.value = "";
        }
    }

    function cancelEditing() {
        setEditingId(null);
        setEditText("");
        setEditPhoto(null);
        setEditRemovePhoto(false);
        if (editFileRef.current) {
            editFileRef.current.value = "";
        }
    }

    async function saveEdit(post) {
        setSavingEdit(true);
        setActionError("");

        const formData = new FormData();
        formData.append("content", editText);
        formData.append("removePhoto", editRemovePhoto ? "true" : "false");
        if (editPhoto) {
            formData.append("photo", editPhoto);
        }

        try {
            const payload = await apiFetch(`/api/posts/${post.id}`, {
                method: "PUT",
                body: formData,
            });
            setPosts((current) =>
                current.map((entry) =>
                    entry.id === post.id ? payload.post : entry
                )
            );
            cancelEditing();
        } catch (error) {
            handleApiError(error);
        } finally {
            setSavingEdit(false);
        }
    }

    async function handleDelete(post) {
        const confirmed = window.confirm("Delete this post?");
        if (!confirmed) {
            return;
        }

        setDeletingId(post.id);
        setActionError("");

        try {
            await apiFetch(`/api/posts/${post.id}`, { method: "DELETE" });
            setPosts((current) => current.filter((entry) => entry.id !== post.id));
            if (post.post_type === "task") {
                await loadTasks();
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeletingId(null);
        }
    }

    if (!sessionChecked) {
        return (
            <div className="loading-screen">
                <div className="loading-card">
                    <p className="eyebrow">Household Pet Journal</p>
                    <h1>Loading timeline…</h1>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <LoginScreen
                busy={loginBusy}
                error={authError}
                onSubmit={handleLogin}
            />
        );
    }

    const shellClassName = [
        "app-shell",
        tasksCollapsed ? "left-collapsed" : "",
        infoCollapsed ? "right-collapsed" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const postGroups = groupPostsByDay(posts);
    const effectiveExpandedDays = {};
    postGroups.forEach((group, index) => {
        effectiveExpandedDays[group.key] = Object.prototype.hasOwnProperty.call(
            expandedDays,
            group.key
        )
            ? expandedDays[group.key]
            : index < 2;
    });
    const visibleGroups = postGroups.slice(0, visibleDayCount);
    const hasMoreDays = visibleDayCount < postGroups.length;
    const allDaysExpanded =
        visibleGroups.length > 0 &&
        visibleGroups.every((group) => effectiveExpandedDays[group.key]);

    return (
        <div className={shellClassName}>
            <TaskPanel
                tasks={tasks}
                noteValues={taskNotes}
                activeTask={loggingTask}
                collapsed={tasksCollapsed}
                onToggle={() => setTasksCollapsed((current) => !current)}
                onNoteChange={(taskId, value) =>
                    setTaskNotes((current) => ({
                        ...current,
                        [taskId]: value,
                    }))
                }
                onLogTask={handleQuickLog}
            />

            <main className="panel center-panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Shared Feed</p>
                        <h2>Pet timeline</h2>
                    </div>
                    <div className="user-chip">{user.display_name}</div>
                </div>

                <form className="composer-card" onSubmit={handleCreatePost}>
                    <label className="field">
                        <span>Post an update</span>
                        <textarea
                            rows="4"
                            placeholder="What happened with the pets today?"
                            value={composerText}
                            onChange={(event) => setComposerText(event.target.value)}
                        />
                    </label>

                    <div className="composer-actions">
                        <label className="file-pill">
                            Add photo
                            <input
                                ref={composerFileRef}
                                type="file"
                                accept="image/*"
                                onChange={(event) =>
                                    setComposerPhoto(event.target.files?.[0] || null)
                                }
                            />
                        </label>

                        {composerPhoto ? (
                            <div className="file-chip">{composerPhoto.name}</div>
                        ) : (
                            <div className="muted">Text-only posts are fine too.</div>
                        )}

                        <button
                            className="primary-button"
                            type="submit"
                            disabled={composeBusy}
                        >
                            {composeBusy ? "Posting..." : "Post update"}
                        </button>
                    </div>
                </form>

                {actionError ? <div className="error-banner">{actionError}</div> : null}

                {postGroups.length > 0 ? (
                    <div className="timeline-toolbar">
                        <p className="muted">
                            Newest three days load first. Newest two stay open by
                            default.
                        </p>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                                setExpandedDays(() => {
                                    const next = {};
                                    visibleGroups.forEach((group) => {
                                        next[group.key] = !allDaysExpanded;
                                    });
                                    return next;
                                })
                            }
                        >
                            {allDaysExpanded ? "Collapse all" : "Expand all"}
                        </button>
                    </div>
                ) : null}

                <div className="timeline-list">
                    {loadingDashboard && posts.length === 0 ? (
                        <div className="empty-state">Loading posts…</div>
                    ) : null}

                    {!loadingDashboard && posts.length === 0 ? (
                        <div className="empty-state">
                            No updates yet. Add the first pet note or task completion.
                        </div>
                    ) : null}

                    {visibleGroups.map((group) => (
                        <TimelineDaySection
                            key={group.key}
                            group={group}
                            expanded={Boolean(effectiveExpandedDays[group.key])}
                            onToggle={() =>
                                setExpandedDays((current) => ({
                                    ...current,
                                    [group.key]: !effectiveExpandedDays[group.key],
                                }))
                            }
                        >
                            {group.posts.map((post) => (
                                <TimelineItem
                                    key={post.id}
                                    post={post}
                                    isEditing={editingId === post.id}
                                    editText={editText}
                                    editPhoto={editPhoto}
                                    editRemovePhoto={editRemovePhoto}
                                    editFileRef={editFileRef}
                                    savingEdit={savingEdit}
                                    deletingId={deletingId}
                                    onStartEdit={startEditing}
                                    onCancelEdit={cancelEditing}
                                    onEditTextChange={setEditText}
                                    onEditPhotoChange={setEditPhoto}
                                    onToggleRemovePhoto={setEditRemovePhoto}
                                    onSaveEdit={saveEdit}
                                    onDelete={handleDelete}
                                    commentDraft={commentDrafts[post.id] || ""}
                                    commentBusy={commentingId === post.id}
                                    reactionBusyKey={reactionBusyKey}
                                    onCommentDraftChange={(value) =>
                                        setCommentDrafts((current) => ({
                                            ...current,
                                            [post.id]: value,
                                        }))
                                    }
                                    onSubmitComment={handleSubmitComment}
                                    onToggleReaction={handleToggleReaction}
                                />
                            ))}
                        </TimelineDaySection>
                    ))}

                    {hasMoreDays ? (
                        <button
                            className="secondary-button load-more-button"
                            type="button"
                            onClick={() =>
                                setVisibleDayCount((current) =>
                                    Math.min(postGroups.length, current + 3)
                                )
                            }
                        >
                            Load older days
                        </button>
                    ) : null}
                </div>
            </main>

            <InfoPanel
                user={user}
                weather={weather}
                now={now}
                onRefresh={loadDashboard}
                onLogout={handleLogout}
                loading={loadingDashboard}
                collapsed={infoCollapsed}
                onToggle={() => setInfoCollapsed((current) => !current)}
            />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
