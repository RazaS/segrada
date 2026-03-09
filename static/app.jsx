const { useEffect, useRef, useState } = React;

const TIMEZONE = window.APP_CONFIG.timezone;

function apiFetch(url, options = {}) {
    return fetch(url, {
        credentials: "same-origin",
        ...options,
    }).then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const message = payload?.error || "Request failed.";
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        return payload;
    });
}

function currentMonthKey() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    return `${year}-${month}`;
}

function sortBodyParts(parts) {
    return [...parts].sort((left, right) => {
        if ((left.sort_order || 0) !== (right.sort_order || 0)) {
            return (left.sort_order || 0) - (right.sort_order || 0);
        }
        return left.label.localeCompare(right.label);
    });
}

function sortExercises(exercises, bodyParts) {
    const orderMap = new Map(
        bodyParts.map((part, index) => [part.id, part.sort_order || index + 1])
    );

    return [...exercises].sort((left, right) => {
        const leftOrder = orderMap.get(left.body_part) || 999;
        const rightOrder = orderMap.get(right.body_part) || 999;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        if ((left.sort_order || 0) !== (right.sort_order || 0)) {
            return (left.sort_order || 0) - (right.sort_order || 0);
        }
        return left.name.localeCompare(right.name);
    });
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-CA", {
        month: "long",
        year: "numeric",
        timeZone: TIMEZONE,
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function previousMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 2, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const value = new Date(Date.UTC(year, month, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatTimestamp(value) {
    if (!value) {
        return "";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

function getInitialTheme() {
    const storedTheme = localStorage.getItem("workout-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
        return storedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function daysInMonth(year, monthNumber) {
    return new Date(year, monthNumber, 0).getDate();
}

function weekdayOffset(year, monthNumber) {
    return new Date(year, monthNumber - 1, 1).getDay();
}

function createDraftEntry(exercise) {
    return {
        exercise_id: exercise.id,
        sets: 1,
        reps: 1,
        weight: exercise.last_weight || 0,
        chipHints: {
            sets: "abs:1",
            reps: "abs:1",
            weight: "default",
        },
        activeChips: {
            sets: null,
            reps: null,
            weight: null,
        },
    };
}

function getVisibleTimelineItems(timeline, visibleWorkoutSessions) {
    let sessionsShown = 0;
    const items = [];

    timeline.forEach((item) => {
        if (item.item_type === "workout_session") {
            if (sessionsShown >= visibleWorkoutSessions) {
                return;
            }
            sessionsShown += 1;
        }

        items.push(item);
    });

    return items;
}

function getBodyPartCountStyle(lastUsedAt) {
    if (!lastUsedAt) {
        return {};
    }

    const usedAt = new Date(lastUsedAt);
    const elapsedHours = (Date.now() - usedAt.getTime()) / (1000 * 60 * 60);
    if (Number.isNaN(elapsedHours) || elapsedHours >= 48) {
        return {};
    }

    const strength = Math.max(0, 1 - elapsedHours / 48);
    const alpha = 0.12 + strength * 0.55;
    return {
        backgroundColor: `rgba(255, 205, 163, ${alpha})`,
        borderColor: `rgba(184, 95, 47, ${0.1 + strength * 0.28})`,
    };
}

function LoginScreen({ busy, error, onSubmit }) {
    const [username, setUsername] = useState("raza");
    const [password, setPassword] = useState("");

    function handleSubmit(event) {
        event.preventDefault();
        onSubmit(username, password);
    }

    return (
        <div className="login-shell">
            <section className="login-card">
                <p className="eyebrow">Training Ledger</p>
                <h1>Sign in to your workout log</h1>
                <p className="lede">
                    Persistent login, fast workout logging, diet taps, and a timeline
                    that keeps every session in one place.
                </p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label className="field">
                        <span>Username</span>
                        <input
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            required
                        />
                    </label>

                    <label className="field">
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </label>

                    {error ? <div className="error-banner">{error}</div> : null}

                    <button className="primary-button large" type="submit" disabled={busy}>
                        {busy ? "Signing in..." : "Enter app"}
                    </button>
                </form>
            </section>
        </div>
    );
}

function IconButton({ label, onClick, disabled, active = false, children }) {
    return (
        <button
            className={`icon-button ${active ? "active" : ""}`}
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
        >
            <span className="icon-symbol" aria-hidden="true">{children}</span>
        </button>
    );
}

function NumericInput({ value, min = null, className, onCommit }) {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    function normalize(rawValue) {
        if (rawValue === "" || rawValue === "-") {
            return null;
        }

        const parsed = Number(rawValue);
        if (Number.isNaN(parsed)) {
            return null;
        }

        return min === null ? parsed : Math.max(min, parsed);
    }

    return (
        <input
            className={className}
            type="number"
            min={min === null ? undefined : min}
            value={draft}
            onChange={(event) => {
                const rawValue = event.target.value;
                setDraft(rawValue);
                const normalized = normalize(rawValue);
                if (normalized !== null) {
                    onCommit(normalized);
                }
            }}
            onBlur={() => {
                const normalized = normalize(draft);
                if (normalized === null) {
                    setDraft(String(value));
                    return;
                }
                onCommit(normalized);
                setDraft(String(normalized));
            }}
        />
    );
}

function chipClassName(buttonKey, activeChipKey, softChipKey) {
    if (activeChipKey === buttonKey) {
        return "mini-chip active";
    }
    if (softChipKey === buttonKey) {
        return "mini-chip soft-active";
    }
    return "mini-chip";
}

function MetricControl({
    label,
    value,
    min = null,
    onChange,
    absoluteButtons = [],
    incrementButtons = [],
    activeChipKey = null,
    softChipKey = null,
    showDefaultButton = false,
    onDefault,
}) {
    return (
        <div className="metric-control">
            <div className="metric-header">
                <span>{label}</span>
                <NumericInput
                    className="metric-input"
                    value={value}
                    min={min}
                    onCommit={(nextValue) => onChange(nextValue, null)}
                />
            </div>

            <div className="metric-actions">
                {absoluteButtons.map((buttonValue) => {
                    const buttonKey = `abs:${buttonValue}`;
                    return (
                        <button
                            key={`${label}-abs-${buttonValue}`}
                            className={chipClassName(buttonKey, activeChipKey, softChipKey)}
                            type="button"
                            onClick={() => onChange(buttonValue, buttonKey)}
                        >
                            {buttonValue}
                        </button>
                    );
                })}

                {incrementButtons.map((buttonValue) => {
                    const buttonKey = `inc:${buttonValue}`;
                    return (
                        <button
                            key={`${label}-inc-${buttonValue}`}
                            className={chipClassName(buttonKey, activeChipKey, softChipKey)}
                            type="button"
                            onClick={() => onChange(value + buttonValue, buttonKey)}
                        >
                            +{buttonValue}
                        </button>
                    );
                })}

                {showDefaultButton ? (
                    <button
                        className={chipClassName("default", activeChipKey, softChipKey)}
                        type="button"
                        onClick={() => onDefault("default")}
                    >
                        Default
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function ExerciseCard({
    exercise,
    draftEntry,
    onToggleExercise,
    onChangeMetric,
}) {
    const selected = Boolean(draftEntry);

    return (
        <article className={`exercise-card ${selected ? "is-selected" : ""}`}>
            <div className="exercise-head">
                <div>
                    <h4>{exercise.name}</h4>
                    <p className="muted">
                        Default weight: {exercise.last_weight}
                        {exercise.is_custom ? " · custom" : ""}
                    </p>
                </div>

                <button
                    className={`${selected ? "secondary-button" : "primary-button"} compact-button`}
                    type="button"
                    onClick={() => onToggleExercise(exercise)}
                >
                    {selected ? "Remove" : "Add"}
                </button>
            </div>

            {selected ? (
                <div className="exercise-metrics">
                    <MetricControl
                        label="Sets"
                        value={draftEntry.sets}
                        min={1}
                        absoluteButtons={[1, 2, 3, 4, 5]}
                        incrementButtons={[1]}
                        activeChipKey={draftEntry.activeChips.sets}
                        softChipKey={draftEntry.activeChips.sets ? null : draftEntry.chipHints.sets}
                        onChange={(value, chipKey) => onChangeMetric(exercise.id, "sets", value, chipKey)}
                    />

                    <MetricControl
                        label="Reps"
                        value={draftEntry.reps}
                        min={1}
                        absoluteButtons={[1, 2, 3, 4, 5]}
                        incrementButtons={[1, 5]}
                        activeChipKey={draftEntry.activeChips.reps}
                        softChipKey={draftEntry.activeChips.reps ? null : draftEntry.chipHints.reps}
                        onChange={(value, chipKey) => onChangeMetric(exercise.id, "reps", value, chipKey)}
                    />

                    <MetricControl
                        label="Weight"
                        value={draftEntry.weight}
                        incrementButtons={[5, 10, 20]}
                        activeChipKey={draftEntry.activeChips.weight}
                        softChipKey={draftEntry.activeChips.weight ? null : draftEntry.chipHints.weight}
                        showDefaultButton
                        onDefault={(chipKey) => onChangeMetric(exercise.id, "weight", exercise.last_weight || 0, chipKey)}
                        onChange={(value, chipKey) => onChangeMetric(exercise.id, "weight", value, chipKey)}
                    />
                </div>
            ) : null}
        </article>
    );
}

function BodyPartSection({
    part,
    exercises,
    expanded,
    onToggle,
    draftEntries,
    onToggleExercise,
    onChangeMetric,
}) {
    return (
        <section className={`body-part-card ${expanded ? "is-open" : ""}`}>
            <button className="body-part-header" type="button" onClick={onToggle}>
                <div>
                    <p className="eyebrow body-part-count" style={getBodyPartCountStyle(part.last_used_at)}>
                        {exercises.length} exercises
                    </p>
                    <h3>{part.label}</h3>
                </div>
                <div className="body-part-meta">
                    <span className="days-badge">
                        {part.days_since_used === null ? "—" : part.days_since_used}
                    </span>
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </div>
            </button>

            {expanded ? (
                exercises.length ? (
                    <div className="exercise-list">
                        {exercises.map((exercise) => (
                            <ExerciseCard
                                key={exercise.id}
                                exercise={exercise}
                                draftEntry={draftEntries[exercise.id]}
                                onToggleExercise={onToggleExercise}
                                onChangeMetric={onChangeMetric}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-inline">No exercises in this section yet.</div>
                )
            ) : null}
        </section>
    );
}

function QuickPanel({
    bodyParts,
    exercises,
    expandedParts,
    draftEntries,
    collapsed,
    loggingWorkout,
    activeQueue,
    onToggleCollapsed,
    onToggleBodyPart,
    onToggleAllBodyParts,
    onToggleExercise,
    onChangeMetric,
    onLogWorkout,
    onClearWorkout,
    onOpenManageExercises,
    onOpenQueue,
}) {
    const activeExercises = exercises.filter((exercise) => exercise.is_active);
    const selectedCount = Object.keys(draftEntries).length;

    const grouped = bodyParts.map((part) => ({
        ...part,
        exercises: activeExercises.filter((exercise) => exercise.body_part === part.id),
    }));
    const allExpanded = grouped.length > 0 && grouped.every((part) => Boolean(expandedParts[part.id]));
    const queueCount = activeQueue?.entries?.length || 0;

    return (
        <aside className={`panel quick-panel ${collapsed ? "is-collapsed" : ""}`}>
            <div className="panel-header">
                <div
                    className="quick-panel-title"
                    role="button"
                    tabIndex={0}
                    onClick={onToggleCollapsed}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onToggleCollapsed();
                        }
                    }}
                >
                    <p className="eyebrow">Quick Tasks</p>
                    <h2>Workout builder</h2>
                </div>
            </div>

            {collapsed ? (
                <div className="collapsed-preview">
                    {activeExercises.length} exercises ready · {selectedCount} selected
                </div>
            ) : (
                <>
                    <div className="builder-toolbar">
                        <button className="secondary-button compact-button" type="button" onClick={onToggleAllBodyParts}>
                            {allExpanded ? "Fold" : "Unfold"}
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onOpenManageExercises}>
                            Exercises
                        </button>
                    </div>

                    <div className="panel-body quick-body">
                        {grouped.map((part) => (
                            <BodyPartSection
                                key={part.id}
                                part={part}
                                exercises={part.exercises}
                                expanded={Boolean(expandedParts[part.id])}
                                onToggle={() => onToggleBodyPart(part.id)}
                                draftEntries={draftEntries}
                                onToggleExercise={onToggleExercise}
                                onChangeMetric={onChangeMetric}
                            />
                        ))}
                    </div>

                    <div className="sticky-summary">
                        <div>
                            <strong>{selectedCount}</strong> exercise
                            {selectedCount === 1 ? "" : "s"} ready
                        </div>
                        <div className="summary-actions">
                            <button className="secondary-button compact-button" type="button" onClick={onClearWorkout}>
                                Clear
                            </button>
                            <button className="secondary-button compact-button" type="button" onClick={onOpenQueue}>
                                Queue {queueCount ? `(${queueCount})` : ""}
                            </button>
                            <button
                                className="primary-button compact-button"
                                type="button"
                                disabled={selectedCount === 0 || loggingWorkout}
                                onClick={onLogWorkout}
                            >
                                {loggingWorkout ? "Logging..." : "Log workout"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </aside>
    );
}

function WorkoutTable({
    entries,
    editable = false,
    showDelete = false,
    showLoggedAt = false,
    onChangeEntry,
    onDeleteEntry,
    deleteBusyId = null,
}) {
    const shouldShowDelete = showDelete || editable;

    return (
        <div className="table-wrap">
            <table className="workout-table">
                <thead>
                    <tr>
                        {showLoggedAt ? <th>Logged</th> : null}
                        <th>Exercise</th>
                        <th>Section</th>
                        <th>Sets</th>
                        <th>Reps</th>
                        <th>Weight</th>
                        {shouldShowDelete ? <th /> : null}
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.id || `${entry.exercise_id}-${entry.created_at || entry.exercise_name}`}>
                            {showLoggedAt ? <td>{formatTimestamp(entry.created_at)}</td> : null}
                            <td>
                                <div className="table-exercise-name">
                                    {entry.exercise_name}
                                    {entry.is_pr ? <span className="pr-tag">PR</span> : null}
                                </div>
                            </td>
                            <td>{entry.body_part_label}</td>
                            <td>
                                {editable ? (
                                    <NumericInput
                                        className="table-input"
                                        value={entry.sets}
                                        min={1}
                                        onCommit={(nextValue) => onChangeEntry(entry.id, "sets", nextValue)}
                                    />
                                ) : (
                                    entry.sets
                                )}
                            </td>
                            <td>
                                {editable ? (
                                    <NumericInput
                                        className="table-input"
                                        value={entry.reps}
                                        min={1}
                                        onCommit={(nextValue) => onChangeEntry(entry.id, "reps", nextValue)}
                                    />
                                ) : (
                                    entry.reps
                                )}
                            </td>
                            <td>
                                {editable ? (
                                    <NumericInput
                                        className="table-input"
                                        value={entry.weight}
                                        onCommit={(nextValue) => onChangeEntry(entry.id, "weight", nextValue)}
                                    />
                                ) : (
                                    entry.weight
                                )}
                            </td>
                            {shouldShowDelete ? (
                                <td className="table-action-cell">
                                    <button
                                        className="secondary-button compact-button table-delete-button"
                                        type="button"
                                        disabled={deleteBusyId === entry.id}
                                        onClick={() => onDeleteEntry(entry.id)}
                                    >
                                        {deleteBusyId === entry.id ? "Deleting..." : "Delete"}
                                    </button>
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function WorkoutSessionCard({
    session,
    onSave,
    onDelete,
    onDeleteEntry,
    deleteBusy = false,
    deleteEntryBusyId = null,
    allowEdit = true,
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draftEntries, setDraftEntries] = useState(session.entries);

    useEffect(() => {
        setDraftEntries(session.entries);
    }, [session.id, session.entries]);

    async function handleWrenchClick() {
        if (!editing) {
            setExpanded(true);
            setEditing(true);
            return;
        }

        setSaving(true);
        const saved = await onSave(session.id, draftEntries);
        setSaving(false);
        if (saved) {
            setEditing(false);
        }
    }

    function handleChangeEntry(entryId, field, value) {
        setDraftEntries((current) =>
            current.map((entry) =>
                entry.id === entryId
                    ? {
                        ...entry,
                        [field]: value,
                    }
                    : entry
            )
        );
    }

    return (
        <article className="timeline-card workout-event">
            <div className="timeline-topline">
                <div className="timeline-kind-row">
                    <span className="timeline-kind">Workout</span>
                    {session.has_pr ? <span className="pr-tag">PR</span> : null}
                    {session.is_active_queue ? <span className="queue-tag">Queue</span> : null}
                </div>
                <div className="timeline-card-tools">
                    <span className="timeline-time">{formatTimestamp(session.last_logged_at)}</span>
                    {allowEdit ? (
                        <>
                            <IconButton
                                label={editing ? "Save workout" : "Edit workout"}
                                onClick={handleWrenchClick}
                                disabled={saving || deleteBusy}
                                active={editing}
                            >
                                🔧
                            </IconButton>
                            <IconButton
                                label="Delete workout"
                                onClick={() => onDelete(session.id)}
                                disabled={saving || deleteBusy}
                            >
                                🗑
                            </IconButton>
                        </>
                    ) : null}
                </div>
            </div>

            <button className="session-summary-button" type="button" onClick={() => setExpanded((current) => !current)}>
                <div>
                    <h3>{session.author_name}</h3>
                    <p className="muted">
                        {session.exercise_count} exercises · volume {session.total_volume}
                        {session.body_parts.length ? ` · ${session.body_parts.join(", ")}` : ""}
                    </p>
                </div>
                <span className="session-toggle-indicator" aria-hidden="true">
                    {expanded ? "−" : "+"}
                </span>
            </button>

            {expanded ? (
                <WorkoutTable
                    entries={editing ? draftEntries : session.entries}
                    editable={editing}
                    onChangeEntry={handleChangeEntry}
                    onDeleteEntry={onDeleteEntry}
                    deleteBusyId={deleteEntryBusyId}
                />
            ) : null}
        </article>
    );
}

function TimelineEvent({
    item,
    onSaveSession,
    onDeleteSession,
    onDeleteEntry,
    deleteBusyId,
    deleteEntryBusyId,
}) {
    if (item.item_type === "workout_session") {
        return (
            <WorkoutSessionCard
                session={item}
                onSave={onSaveSession}
                onDelete={onDeleteSession}
                onDeleteEntry={onDeleteEntry}
                deleteBusy={deleteBusyId === item.id}
                deleteEntryBusyId={deleteEntryBusyId}
            />
        );
    }

    if (item.event_type === "protein_shake") {
        return (
            <article className="timeline-card diet-event">
                <div className="timeline-topline">
                    <span className="timeline-kind">Diet</span>
                    <span className="timeline-time">{formatTimestamp(item.created_at)}</span>
                </div>
                <h3>Protein shake</h3>
                <p className="muted">Logged with one tap.</p>
            </article>
        );
    }

    if (item.event_type === "meal") {
        return (
            <article className="timeline-card diet-event">
                <div className="timeline-topline">
                    <span className="timeline-kind">Diet</span>
                    <span className="timeline-time">{formatTimestamp(item.created_at)}</span>
                </div>
                <h3>Meal eaten</h3>
                <p className="muted">
                    High protein: {item.high_protein ? "Yes" : "No"}
                </p>
            </article>
        );
    }

    return null;
}

function TimelinePanel({
    user,
    timeline,
    loading,
    theme,
    visibleWorkoutSessions,
    onToggleTheme,
    onLogout,
    onRefresh,
    onSaveSession,
    onDeleteSession,
    onDeleteEntry,
    deleteBusyId,
    deleteEntryBusyId,
    onShowMore,
    error,
}) {
    const visibleItems = getVisibleTimelineItems(timeline, visibleWorkoutSessions);
    const totalWorkoutSessions = timeline.filter((item) => item.item_type === "workout_session").length;
    const showMore = totalWorkoutSessions > visibleWorkoutSessions;

    return (
        <main className="panel timeline-panel">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Timeline</p>
                    <h2>Workout log</h2>
                </div>

                <div className="panel-header-actions header-tools">
                    <div className="user-chip">{user.display_name}</div>
                    <div className="icon-button-row">
                        <IconButton
                            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            onClick={onToggleTheme}
                        >
                            {theme === "dark" ? "☀" : "☾"}
                        </IconButton>
                        <IconButton label="Refresh" onClick={onRefresh} disabled={loading}>
                            ↻
                        </IconButton>
                        <IconButton label="Log out" onClick={onLogout}>
                            ⇥
                        </IconButton>
                    </div>
                </div>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            <div className="timeline-list">
                {loading && timeline.length === 0 ? (
                    <div className="empty-state">Loading timeline...</div>
                ) : null}

                {!loading && timeline.length === 0 ? (
                    <div className="empty-state">
                        No entries yet. Build a workout or tap one of the diet actions below.
                    </div>
                ) : null}

                {visibleItems.map((item) => (
                    <TimelineEvent
                        key={`${item.item_type || item.event_type}-${item.id}`}
                        item={item}
                        onSaveSession={onSaveSession}
                        onDeleteSession={onDeleteSession}
                        onDeleteEntry={onDeleteEntry}
                        deleteBusyId={deleteBusyId}
                        deleteEntryBusyId={deleteEntryBusyId}
                    />
                ))}

                {showMore ? (
                    <button className="secondary-button show-more-button" type="button" onClick={onShowMore}>
                        See more
                    </button>
                ) : null}
            </div>
        </main>
    );
}

function DietTab({ onProteinShake, onMeal, logging }) {
    return (
        <div className="bottom-content">
            <section className="utility-card">
                <p className="eyebrow">Diet</p>
                <h3>One-tap logs</h3>
                <div className="diet-actions">
                    <button
                        className="primary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={onProteinShake}
                    >
                        {logging ? "Logging..." : "Drank protein shake"}
                    </button>
                </div>
            </section>

            <section className="utility-card">
                <p className="eyebrow">Meal</p>
                <h3>Log a meal</h3>
                <div className="diet-actions">
                    <button
                        className="secondary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={() => onMeal(true)}
                    >
                        Meal eaten · high protein
                    </button>
                    <button
                        className="secondary-button compact-button"
                        type="button"
                        disabled={logging}
                        onClick={() => onMeal(false)}
                    >
                        Meal eaten · not high protein
                    </button>
                </div>
            </section>
        </div>
    );
}

function CalendarTab({ calendar, onPreviousMonth, onNextMonth, onOpenArchive, loading }) {
    const totalDays = daysInMonth(calendar.year, calendar.month_number);
    const offset = weekdayOffset(calendar.year, calendar.month_number);
    const cells = [];

    for (let index = 0; index < offset; index += 1) {
        cells.push(<div key={`blank-${index}`} className="calendar-cell empty" />);
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const workedOut = calendar.workout_days.includes(day);
        cells.push(
            <div key={day} className={`calendar-cell ${workedOut ? "worked-out" : ""}`}>
                <span className="calendar-day-number">{day}</span>
                <span className="calendar-marker">{workedOut ? "x" : ""}</span>
            </div>
        );
    }

    return (
        <div className="bottom-content">
            <section className="utility-card calendar-card">
                <div className="calendar-header">
                    <div>
                        <p className="eyebrow">Workout Calendar</p>
                        <h3>{formatMonthLabel(calendar.month)}</h3>
                    </div>

                    <div className="calendar-actions">
                        <button className="secondary-button compact-button" type="button" onClick={onOpenArchive}>
                            Archive
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onPreviousMonth} disabled={loading}>
                            Prev
                        </button>
                        <button className="secondary-button compact-button" type="button" onClick={onNextMonth} disabled={loading}>
                            Next
                        </button>
                    </div>
                </div>

                <div className="calendar-weekdays">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>

                <div className="calendar-grid">{cells}</div>
                <p className="tiny-note">Green x marks a day with at least one logged workout.</p>
            </section>
        </div>
    );
}

function BottomPanel({
    activeTab,
    onChangeTab,
    calendar,
    calendarLoading,
    dietLogging,
    onProteinShake,
    onMeal,
    onPreviousMonth,
    onNextMonth,
    onOpenArchive,
}) {
    return (
        <section className="panel bottom-panel">
            <div className="bottom-nav">
                <button
                    className={`nav-pill ${activeTab === "diet" ? "active" : ""}`}
                    type="button"
                    onClick={() => onChangeTab("diet")}
                >
                    Diet
                </button>
                <button
                    className={`nav-pill ${activeTab === "calendar" ? "active" : ""}`}
                    type="button"
                    onClick={() => onChangeTab("calendar")}
                >
                    Calendar
                </button>
            </div>

            {activeTab === "diet" ? (
                <DietTab
                    onProteinShake={onProteinShake}
                    onMeal={onMeal}
                    logging={dietLogging}
                />
            ) : (
                <CalendarTab
                    calendar={calendar}
                    onPreviousMonth={onPreviousMonth}
                    onNextMonth={onNextMonth}
                    onOpenArchive={onOpenArchive}
                    loading={calendarLoading}
                />
            )}
        </section>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="modal-backdrop" role="presentation" onClick={onClose}>
            <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div>
                        <p className="eyebrow">Manage</p>
                        <h3>{title}</h3>
                    </div>
                    <button className="secondary-button compact-button" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function ExerciseManagementModal({
    bodyParts,
    exercises,
    busyId,
    addExerciseBusy,
    addSectionBusy,
    error,
    onClose,
    onAddExercise,
    onAddSection,
    onToggleVisibility,
    onMoveExercise,
}) {
    const [exerciseName, setExerciseName] = useState("");
    const [exerciseBodyPart, setExerciseBodyPart] = useState(bodyParts[0]?.id || "");
    const [sectionLabel, setSectionLabel] = useState("");
    const [moveTargets, setMoveTargets] = useState({});

    useEffect(() => {
        if (!bodyParts.length) {
            return;
        }

        const found = bodyParts.some((part) => part.id === exerciseBodyPart);
        if (!found) {
            setExerciseBodyPart(bodyParts[0].id);
        }
    }, [bodyParts, exerciseBodyPart]);

    async function handleAddExercise(event) {
        event.preventDefault();
        const saved = await onAddExercise({
            name: exerciseName,
            body_part: exerciseBodyPart,
        });
        if (saved) {
            setExerciseName("");
        }
    }

    async function handleAddSection(event) {
        event.preventDefault();
        const saved = await onAddSection(sectionLabel);
        if (saved) {
            setSectionLabel("");
        }
    }

    return (
        <Modal title="Exercises" onClose={onClose}>
            {error ? <div className="error-banner">{error}</div> : null}

            <div className="management-forms">
                <form className="management-form-card" onSubmit={handleAddExercise}>
                    <p className="eyebrow">Add Exercise</p>
                    <label className="field">
                        <span>Exercise name</span>
                        <input
                            type="text"
                            value={exerciseName}
                            onChange={(event) => setExerciseName(event.target.value)}
                            placeholder="Example: Cable curls"
                            required
                        />
                    </label>

                    <label className="field">
                        <span>Section</span>
                        <select
                            value={exerciseBodyPart}
                            onChange={(event) => setExerciseBodyPart(event.target.value)}
                        >
                            {bodyParts.map((part) => (
                                <option key={part.id} value={part.id}>
                                    {part.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="management-form-actions">
                        <button
                            className="primary-button compact-button management-primary-button"
                            type="submit"
                            disabled={addExerciseBusy}
                        >
                            {addExerciseBusy ? "Saving..." : "Add exercise"}
                        </button>
                    </div>
                </form>

                <form className="management-form-card" onSubmit={handleAddSection}>
                    <p className="eyebrow">Add Section</p>
                    <label className="field">
                        <span>Section name</span>
                        <input
                            type="text"
                            value={sectionLabel}
                            onChange={(event) => setSectionLabel(event.target.value)}
                            placeholder="Example: Cardio"
                            required
                        />
                    </label>

                    <button className="secondary-button compact-button" type="submit" disabled={addSectionBusy}>
                        {addSectionBusy ? "Saving..." : "Add section"}
                    </button>
                </form>
            </div>

            <div className="management-list">
                {bodyParts.map((part) => {
                    const items = exercises.filter((exercise) => exercise.body_part === part.id);

                    return (
                        <section key={part.id} className="management-group">
                            <div className="management-group-header">
                                <div>
                                    <p className="eyebrow">{part.label}</p>
                                    <strong>{part.label}</strong>
                                </div>
                                <span className="muted">{items.length} exercises</span>
                            </div>

                            {items.length ? (
                                <div className="management-items">
                                    {items.map((exercise) => {
                                        const target = moveTargets[exercise.id] || exercise.body_part;
                                        const isMoving = busyId === exercise.id;
                                        return (
                                            <div key={exercise.id} className="management-row">
                                                <div className="management-copy">
                                                    <strong>{exercise.name}</strong>
                                                    <p className="muted">
                                                        {exercise.is_active
                                                            ? "Shown in quick access"
                                                            : "Hidden from quick access"}
                                                        {exercise.is_custom ? " · custom" : ""}
                                                    </p>
                                                </div>

                                                <div className="management-controls">
                                                    <select
                                                        className="management-select"
                                                        value={target}
                                                        disabled={isMoving}
                                                        onChange={(event) =>
                                                            setMoveTargets((current) => ({
                                                                ...current,
                                                                [exercise.id]: event.target.value,
                                                            }))
                                                        }
                                                    >
                                                        {bodyParts.map((bodyPart) => (
                                                            <option key={bodyPart.id} value={bodyPart.id}>
                                                                {bodyPart.label}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <button
                                                        className="secondary-button compact-button"
                                                        type="button"
                                                        disabled={isMoving || target === exercise.body_part}
                                                        onClick={() => onMoveExercise(exercise, target)}
                                                    >
                                                        {isMoving ? "Saving..." : "Move"}
                                                    </button>

                                                    <button
                                                        className="secondary-button compact-button"
                                                        type="button"
                                                        disabled={isMoving}
                                                        onClick={() => onToggleVisibility(exercise)}
                                                    >
                                                        {isMoving
                                                            ? "Saving..."
                                                            : exercise.is_active
                                                                ? "Hide"
                                                                : "Show"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="empty-inline">No exercises here yet.</div>
                            )}
                        </section>
                    );
                })}
            </div>
        </Modal>
    );
}

function QueueModal({ session, deleteBusyId, onDeleteEntry, onClose }) {
    return (
        <Modal title="Queue" onClose={onClose}>
            <div className="queue-modal-content">
                {!session ? (
                    <div className="empty-state">No active workout queue yet.</div>
                ) : (
                    <>
                        <div className="queue-summary">
                            <p className="eyebrow">Current Session</p>
                            <h3>{session.exercise_count} logged items</h3>
                            <p className="muted">
                                Last change {formatTimestamp(session.last_logged_at)}
                            </p>
                        </div>

                        <div className="management-list">
                            <WorkoutTable
                                entries={session.entries}
                                showDelete
                                showLoggedAt
                                onDeleteEntry={onDeleteEntry}
                                deleteBusyId={deleteBusyId}
                            />
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

function ArchiveModal({ sessions, onClose }) {
    return (
        <Modal title="Archive" onClose={onClose}>
            <div className="management-list archive-list">
                {sessions.length ? (
                    sessions.map((session) => (
                        <WorkoutSessionCard
                            key={session.id}
                            session={session}
                            onSave={async () => true}
                            allowEdit={false}
                        />
                    ))
                ) : (
                    <div className="empty-state">No workouts archived yet.</div>
                )}
            </div>
        </Modal>
    );
}

function App() {
    const initialMonth = currentMonthKey();
    const [sessionChecked, setSessionChecked] = useState(false);
    const [user, setUser] = useState(null);
    const [bodyParts, setBodyParts] = useState([]);
    const [exercises, setExercises] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [activeQueue, setActiveQueue] = useState(null);
    const [calendar, setCalendar] = useState({
        month: initialMonth,
        year: Number(initialMonth.slice(0, 4)),
        month_number: Number(initialMonth.slice(5, 7)),
        workout_days: [],
    });

    const [theme, setTheme] = useState(getInitialTheme);
    const [loginBusy, setLoginBusy] = useState(false);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [loggingWorkout, setLoggingWorkout] = useState(false);
    const [dietLogging, setDietLogging] = useState(false);
    const [authError, setAuthError] = useState("");
    const [actionError, setActionError] = useState("");

    const [quickCollapsed, setQuickCollapsed] = useState(false);
    const [expandedParts, setExpandedParts] = useState({});
    const [draftEntries, setDraftEntries] = useState({});
    const [bottomTab, setBottomTab] = useState("diet");
    const [visibleWorkoutSessions, setVisibleWorkoutSessions] = useState(10);

    const [showManageExercises, setShowManageExercises] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const [showArchive, setShowArchive] = useState(false);
    const [manageError, setManageError] = useState("");
    const [manageBusyId, setManageBusyId] = useState(null);
    const [addExerciseBusy, setAddExerciseBusy] = useState(false);
    const [addSectionBusy, setAddSectionBusy] = useState(false);
    const [deleteEntryBusyId, setDeleteEntryBusyId] = useState(null);
    const [deleteSessionBusyId, setDeleteSessionBusyId] = useState(null);

    const calendarMonthRef = useRef(calendar.month);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("workout-theme", theme);
    }, [theme]);

    useEffect(() => {
        calendarMonthRef.current = calendar.month;
    }, [calendar.month]);

    useEffect(() => {
        loadSession();
    }, []);

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

    useEffect(() => {
        if (!user) {
            setBodyParts([]);
            setExercises([]);
            setTimeline([]);
            setDraftEntries({});
            setActiveQueue(null);
            setVisibleWorkoutSessions(10);
            return;
        }

        loadDashboard(calendarMonthRef.current);
    }, [user]);

    async function loadDashboard(monthKey) {
        setDashboardLoading(true);
        setActionError("");
        try {
            const payload = await apiFetch(`/api/dashboard?month=${encodeURIComponent(monthKey)}`);
            setBodyParts(sortBodyParts(payload.body_parts));
            setExercises(sortExercises(payload.exercises, payload.body_parts));
            setTimeline(payload.timeline);
            setCalendar(payload.calendar);
            setActiveQueue(payload.active_queue);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDashboardLoading(false);
        }
    }

    async function loadCalendar(monthKey) {
        setCalendarLoading(true);
        setActionError("");
        try {
            const payload = await apiFetch(`/api/calendar?month=${encodeURIComponent(monthKey)}`);
            setCalendar(payload);
        } catch (error) {
            handleApiError(error);
        } finally {
            setCalendarLoading(false);
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
            setVisibleWorkoutSessions(10);
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
            setShowManageExercises(false);
            setShowQueue(false);
            setShowArchive(false);
        }
    }

    function toggleBodyPart(partId) {
        setExpandedParts((current) => ({
            ...current,
            [partId]: !current[partId],
        }));
    }

    function expandAll() {
        const nextState = {};
        bodyParts.forEach((part) => {
            nextState[part.id] = true;
        });
        setExpandedParts(nextState);
    }

    function collapseAll() {
        setExpandedParts({});
    }

    function toggleAllBodyParts() {
        const allExpanded = bodyParts.length > 0 && bodyParts.every((part) => Boolean(expandedParts[part.id]));
        if (allExpanded) {
            collapseAll();
            return;
        }
        expandAll();
    }

    function toggleExercise(exercise) {
        setDraftEntries((current) => {
            if (current[exercise.id]) {
                const nextEntries = { ...current };
                delete nextEntries[exercise.id];
                return nextEntries;
            }

            return {
                ...current,
                [exercise.id]: createDraftEntry(exercise),
            };
        });
    }

    function changeMetric(exerciseId, field, value, chipKey = null) {
        setDraftEntries((current) => {
            const entry = current[exerciseId];
            if (!entry) {
                return current;
            }

            return {
                ...current,
                [exerciseId]: {
                    ...entry,
                    [field]: value,
                    activeChips: {
                        ...entry.activeChips,
                        [field]: chipKey,
                    },
                },
            };
        });
    }

    async function logWorkout() {
        const entries = Object.values(draftEntries).map((entry) => ({
            exercise_id: entry.exercise_id,
            sets: entry.sets,
            reps: entry.reps,
            weight: entry.weight,
        }));
        if (!entries.length) {
            setActionError("Select at least one exercise before logging.");
            return;
        }

        setLoggingWorkout(true);
        setActionError("");
        try {
            await apiFetch("/api/workouts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ entries }),
            });
            setDraftEntries({});
            await loadDashboard(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setLoggingWorkout(false);
        }
    }

    async function saveWorkoutSession(sessionId, entries) {
        setActionError("");
        try {
            await apiFetch(`/api/workout-sessions/${sessionId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    entries: entries.map((entry) => ({
                        id: entry.id,
                        sets: entry.sets,
                        reps: entry.reps,
                        weight: entry.weight,
                    })),
                }),
            });
            await loadDashboard(calendarMonthRef.current);
            return true;
        } catch (error) {
            handleApiError(error);
            return false;
        }
    }

    async function deleteQueueEntry(entryId) {
        setDeleteEntryBusyId(entryId);
        setActionError("");
        try {
            await apiFetch(`/api/workout-entries/${entryId}`, {
                method: "DELETE",
            });
            await loadDashboard(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleteEntryBusyId(null);
        }
    }

    async function deleteWorkoutSession(sessionId) {
        setDeleteSessionBusyId(sessionId);
        setActionError("");
        try {
            await apiFetch(`/api/workout-sessions/${sessionId}`, {
                method: "DELETE",
            });
            await loadDashboard(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDeleteSessionBusyId(null);
        }
    }

    async function logProteinShake() {
        setDietLogging(true);
        setActionError("");
        try {
            await apiFetch("/api/diet/protein-shake", {
                method: "POST",
            });
            await loadDashboard(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDietLogging(false);
        }
    }

    async function logMeal(highProtein) {
        setDietLogging(true);
        setActionError("");
        try {
            await apiFetch("/api/diet/meal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ high_protein: highProtein }),
            });
            await loadDashboard(calendarMonthRef.current);
        } catch (error) {
            handleApiError(error);
        } finally {
            setDietLogging(false);
        }
    }

    async function handleAddExercise(form) {
        setAddExerciseBusy(true);
        setManageError("");
        try {
            const payload = await apiFetch("/api/exercises", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });
            setExercises((current) => sortExercises([...current, payload.exercise], bodyParts));
            setExpandedParts((current) => ({
                ...current,
                [payload.exercise.body_part]: true,
            }));
            return true;
        } catch (error) {
            setManageError(error.message);
            return false;
        } finally {
            setAddExerciseBusy(false);
        }
    }

    async function handleAddSection(label) {
        setAddSectionBusy(true);
        setManageError("");
        try {
            const payload = await apiFetch("/api/body-parts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ label }),
            });
            setBodyParts((current) => sortBodyParts([...current, payload.body_part]));
            setExpandedParts((current) => ({
                ...current,
                [payload.body_part.id]: true,
            }));
            return true;
        } catch (error) {
            setManageError(error.message);
            return false;
        } finally {
            setAddSectionBusy(false);
        }
    }

    async function handleExerciseUpdate(exercise, updates) {
        setManageBusyId(exercise.id);
        setManageError("");
        try {
            const payload = await apiFetch(`/api/exercises/${exercise.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(updates),
            });

            setExercises((current) =>
                sortExercises(
                    current.map((item) =>
                        item.id === exercise.id ? payload.exercise : item
                    ),
                    bodyParts
                )
            );

            if (Object.prototype.hasOwnProperty.call(updates, "is_active") && !updates.is_active) {
                setDraftEntries((current) => {
                    if (!current[exercise.id]) {
                        return current;
                    }
                    const nextEntries = { ...current };
                    delete nextEntries[exercise.id];
                    return nextEntries;
                });
            }

            if (updates.body_part) {
                setExpandedParts((current) => ({
                    ...current,
                    [updates.body_part]: true,
                }));
            }
        } catch (error) {
            setManageError(error.message);
        } finally {
            setManageBusyId(null);
        }
    }

    function goPreviousMonth() {
        const nextMonthKey = previousMonth(calendarMonthRef.current);
        loadCalendar(nextMonthKey);
        setBottomTab("calendar");
    }

    function goNextMonth() {
        const nextMonthKey = nextMonth(calendarMonthRef.current);
        loadCalendar(nextMonthKey);
        setBottomTab("calendar");
    }

    if (!sessionChecked) {
        return (
            <div className="login-shell">
                <section className="login-card">
                    <p className="eyebrow">Training Ledger</p>
                    <h1>Loading workspace...</h1>
                </section>
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

    const archiveSessions = timeline.filter((item) => item.item_type === "workout_session");

    return (
        <>
            <div className={`app-shell ${quickCollapsed ? "quick-collapsed" : ""}`}>
                <QuickPanel
                    bodyParts={bodyParts}
                    exercises={exercises}
                    expandedParts={expandedParts}
                    draftEntries={draftEntries}
                    collapsed={quickCollapsed}
                    loggingWorkout={loggingWorkout}
                    activeQueue={activeQueue}
                    onToggleCollapsed={() => setQuickCollapsed((current) => !current)}
                    onToggleBodyPart={toggleBodyPart}
                    onToggleAllBodyParts={toggleAllBodyParts}
                    onToggleExercise={toggleExercise}
                    onChangeMetric={changeMetric}
                    onLogWorkout={logWorkout}
                    onClearWorkout={() => setDraftEntries({})}
                    onOpenManageExercises={() => {
                        setManageError("");
                        setShowManageExercises(true);
                    }}
                    onOpenQueue={() => setShowQueue(true)}
                />

                <TimelinePanel
                    user={user}
                    timeline={timeline}
                    loading={dashboardLoading}
                    theme={theme}
                    visibleWorkoutSessions={visibleWorkoutSessions}
                    onToggleTheme={() =>
                        setTheme((current) => (current === "dark" ? "light" : "dark"))
                    }
                    onLogout={handleLogout}
                    onRefresh={() => loadDashboard(calendarMonthRef.current)}
                    onSaveSession={saveWorkoutSession}
                    onDeleteSession={deleteWorkoutSession}
                    onDeleteEntry={deleteQueueEntry}
                    deleteBusyId={deleteSessionBusyId}
                    deleteEntryBusyId={deleteEntryBusyId}
                    onShowMore={() => setVisibleWorkoutSessions((current) => current + 10)}
                    error={actionError}
                />

                <BottomPanel
                    activeTab={bottomTab}
                    onChangeTab={setBottomTab}
                    calendar={calendar}
                    calendarLoading={calendarLoading}
                    dietLogging={dietLogging}
                    onProteinShake={logProteinShake}
                    onMeal={logMeal}
                    onPreviousMonth={goPreviousMonth}
                    onNextMonth={goNextMonth}
                    onOpenArchive={() => {
                        setBottomTab("calendar");
                        setShowArchive(true);
                    }}
                />
            </div>

            {showManageExercises ? (
                <ExerciseManagementModal
                    bodyParts={bodyParts}
                    exercises={exercises}
                    busyId={manageBusyId}
                    addExerciseBusy={addExerciseBusy}
                    addSectionBusy={addSectionBusy}
                    error={manageError}
                    onClose={() => setShowManageExercises(false)}
                    onAddExercise={handleAddExercise}
                    onAddSection={handleAddSection}
                    onToggleVisibility={(exercise) =>
                        handleExerciseUpdate(exercise, {
                            is_active: !exercise.is_active,
                        })
                    }
                    onMoveExercise={(exercise, bodyPart) =>
                        handleExerciseUpdate(exercise, {
                            body_part: bodyPart,
                        })
                    }
                />
            ) : null}

            {showQueue ? (
                <QueueModal
                    session={activeQueue}
                    deleteBusyId={deleteEntryBusyId}
                    onDeleteEntry={deleteQueueEntry}
                    onClose={() => setShowQueue(false)}
                />
            ) : null}

            {showArchive ? (
                <ArchiveModal
                    sessions={archiveSessions}
                    onClose={() => setShowArchive(false)}
                />
            ) : null}
        </>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
