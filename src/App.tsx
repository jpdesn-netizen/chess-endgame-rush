import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { subcategoryOf } from './core/categories';
import { CONFIG, rushRules, TECHNIQUE_RULES, TRAINING_RULES } from './core/config';
import { countPieces } from './core/fen';
import { dueNow, reviewItems } from './core/review';
import { ratingsByKey } from './core/playerRating';
import { dailyPick, dayKey, dayStreak } from './core/motivation';
import { familyOf } from './core/material';
import type { Puzzle } from './core/types';
import { loadLichessPuzzles } from './data/lichessRepository';
import { PUZZLES_MOCK } from './data/puzzlesMock';
import { readEmbedOptions } from './embed';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen, type HomeMode, type ThemeChoice } from './screens/HomeScreen';
import { RushScreen } from './screens/RushScreen';
import { getBest, scoreKey } from './services/highScores';
import { judge } from './services/judge';
import { useCloudAccount } from './hooks/useCloudAccount';
import { openedFromEmailLink } from './services/cloud';
import type { Run } from './services/playerStore';
import { playerStore } from './services/players';
import { getSettings, setSetting } from './services/settings';

type Screen = { name: 'home' } | { name: 'training'; index: number } | { name: 'rush'; run: number } | { name: 'progress' } | { name: 'privacy' } | { name: 'review'; ids: string[]; index: number } | { name: 'technique'; id: string; n: number } | { name: 'daily' } | { name: 'leaderboard' };

const embed = readEmbedOptions();

// Écrans secondaires chargés à part : l'accueil et le jeu s'affichent plus vite.
const loadProgress = () => import('./screens/ProgressScreen');
const loadPrivacy = () => import('./screens/PrivacyScreen');
const loadLeaderboard = () => import('./screens/LeaderboardScreen');
const LeaderboardScreen = lazy(() => loadLeaderboard().then((m) => ({ default: m.LeaderboardScreen })));
const ProgressScreen = lazy(() => loadProgress().then((m) => ({ default: m.ProgressScreen })));
const PrivacyScreen = lazy(() => loadPrivacy().then((m) => ({ default: m.PrivacyScreen })));
// … puis préchargés quelques secondes après l'ouverture (et gardés pour l'usage hors ligne).
if (typeof window !== 'undefined')
  window.setTimeout(() => {
    void loadProgress().catch(() => {});
    void loadPrivacy().catch(() => {});
    void loadLeaderboard().catch(() => {});
  }, 3_000);

/** Famille et sous-catégorie calculées une fois pour toutes au chargement. */
function classify(p: Puzzle): Puzzle {
  const family = p.family ?? familyOf(p.fen);
  return { ...p, family, subcategory: subcategoryOf(p.fen, family) };
}
const BASICS = PUZZLES_MOCK.map(classify);

/**
 * Sous-thèmes exacts couverts par les « Bases » (Lucena, Philidor, dame contre
 * pion…). Les catégories fourre-tout « -autres » sont exclues : elles
 * mélangeraient des milliers de finales sans rapport avec les bases.
 */
const BASICS_SUBS = new Set(BASICS.map((p) => p.subcategory).filter((s) => s && !s.endsWith('-autres')));

/**
 * Puzzles des modes classés (Storm / Streak) : uniquement la base Lichess,
 * dont l'Elo est calculé par Lichess (Glicko-2). Les « Bases », à l'Elo
 * seulement estimé, restent réservées à l'entraînement ; le thème « Bases »
 * tire donc des puzzles Lichess de même matériel.
 */
function buildPool(theme: ThemeChoice, sub: string, lichess: Puzzle[]): Puzzle[] {
  if (theme === 'bases') return lichess.filter((p) => BASICS_SUBS.has(p.subcategory));
  if (theme === 'mix') return lichess;
  return lichess.filter((p) => p.family === theme && (sub === 'all' || p.subcategory === sub));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [mode, setMode] = useState<HomeMode>(embed.mode ?? 'storm');
  const [theme, setTheme] = useState<ThemeChoice>((embed.theme as ThemeChoice) ?? 'mix');
  const [sub, setSub] = useState<string>(embed.sub ?? 'all');
  // Niveau de départ facultatif : null = automatique (exercices les plus faciles du thème, puis ça monte).
  const [startRating, setStartRating] = useState<number | null>(embed.level ?? null);
  const [lichess, setLichess] = useState<Puzzle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() => playerStore.currentPlayerId());

  useEffect(() => {
    loadLichessPuzzles()
      .then((list) => setLichess(list.map(classify)))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of lichess ?? []) {
      map.set(p.family!, (map.get(p.family!) ?? 0) + 1);
      map.set(p.subcategory!, (map.get(p.subcategory!) ?? 0) + 1);
    }
    return map;
  }, [lichess]);

  // Sous-thème trop pauvre (< minPuzzlesPerTheme, ex. lien ▶ ou intégration) : on joue toute la famille.
  const effSub = sub === 'all' || !lichess || (counts.get(sub) ?? 0) >= CONFIG.minPuzzlesPerTheme ? sub : 'all';
  const pool = useMemo(() => (lichess ? buildPool(theme, effSub, lichess) : null), [theme, effSub, lichess]);
  const themeKey = effSub === 'all' ? theme : `${theme}/${effSub}`;
  const autoStart = useMemo(() => {
    if (!pool?.length) return CONFIG.startLevels[0].rating;
    const min = pool.reduce((m, p) => Math.min(m, p.rating), Infinity);
    return Math.max(400, Math.floor(min / 50) * 50);
  }, [pool]);
  const effectiveStart = startRating ?? autoStart;
  // Records : « automatique » a sa propre catégorie (clé 0).
  const key = mode === 'training' ? '' : scoreKey(mode, `${playerId ?? 'invite'}|${themeKey}`, startRating ?? 0);
  const shell = (content: ReactNode) => (
    <main className="min-h-dvh bg-stone-900 text-stone-100">
      <Suspense fallback={<p className="p-6 text-center text-stone-400">Chargement…</p>}>{content}</Suspense>
    </main>
  );

  const changePlayer = useCallback((id: string | null) => {
    playerStore.setCurrentPlayer(id);
    setPlayerId(id);
  }, []);

  const onAttempt = useCallback(
    (puzzle: Puzzle, success: boolean, m: 'storm' | 'streak' | 'training' | 'review' | 'daily') => {
      if (!playerId) return;
      playerStore.addAttempt(playerId, {
        t: Date.now(),
        m,
        p: puzzle.id,
        r: puzzle.rating,
        c: puzzle.subcategory ?? subcategoryOf(puzzle.fen),
        f: puzzle.family ?? familyOf(puzzle.fen),
        ok: success,
      });
    },
    [playerId],
  );
  const onRushAttempt = useCallback((p: Puzzle, ok: boolean) => onAttempt(p, ok, mode === 'streak' ? 'streak' : 'storm'), [onAttempt, mode]);
  const onTrainingAttempt = useCallback((p: Puzzle, ok: boolean) => onAttempt(p, ok, 'training'), [onAttempt]);
  const onRunEnd = useCallback(
    (run: Omit<Run, 't'>) => {
      if (playerId) playerStore.addRun(playerId, { t: Date.now(), ...run });
    },
    [playerId],
  );

  const account = useCloudAccount(playerStore, playerId, changePlayer);
  // Arrivée par le lien « mot de passe oublié » : ouvrir l'écran du compte.
  useEffect(() => {
    if (account.recovery || (account.message?.tone === 'error' && openedFromEmailLink)) setScreen({ name: 'progress' });
  }, [account.recovery, account.message]);

  // Puzzles des parties récentes du joueur (évités tant qu'il reste du choix).
  const recentlySeen = useMemo(
    () => new Set(playerId ? playerStore.history(playerId).attempts.slice(-1500).map((a) => a.p) : []),
    // Recalculé à chaque nouvelle partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, screen],
  );

  // --- Révision des erreurs -------------------------------------------------
  const puzzlesById = useMemo(() => new Map([...BASICS, ...(lichess ?? [])].map((p) => [p.id, p])), [lichess]);
  const [spaced, setSpaced] = useState(() => getSettings().spacedRepetition);
  const reviewAll = useMemo(
    () => (playerId ? reviewItems(playerStore.history(playerId).attempts).filter((i) => puzzlesById.has(i.id)) : []),
    // Recalculé à chaque changement d'écran (après une partie ou une révision).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, puzzlesById, screen],
  );
  // --- Motivation : série de jours et puzzle du jour ----------------------------
  const motivation = useMemo(() => {
    const now = Date.now();
    const daily = dailyPick(lichess ?? [], now);
    if (!playerId) return { streak: null, daily, dailyResult: null as boolean | null };
    const acts = playerStore.history(playerId).attempts;
    const today = dayKey(now);
    const dailyTry = daily ? acts.find((a) => a.m === 'daily' && a.p === daily.id && dayKey(a.t) === today) : undefined;
    return { streak: dayStreak(acts, now), daily, dailyResult: dailyTry ? dailyTry.ok : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, lichess, screen]);
  const dailyRecorded = useRef(false);
  const onDailyAttempt = useCallback(
    (p: Puzzle, ok: boolean) => {
      // Seule la première tentative du jour compte.
      if (dailyRecorded.current || motivation.dailyResult !== null) return;
      dailyRecorded.current = true;
      onAttempt(p, ok, 'daily');
    },
    [onAttempt, motivation.dailyResult],
  );

  // --- Mode technique : positions ≤ 7 pièces jouées jusqu'au bout ------------
  const techniquePool = useMemo(
    () =>
      (lichess ?? []).filter(
        (p) => countPieces(p.fen) <= CONFIG.tablebase.maxPieces && (theme === 'mix' || theme === 'bases' || p.family === theme),
      ),
    [lichess, theme],
  );
  const techniqueSeen = useRef(new Set<string>());
  const nextTechnique = useCallback(
    (n: number) => {
      let choices = techniquePool.filter((p) => !techniqueSeen.current.has(p.id));
      if (!choices.length) {
        techniqueSeen.current = new Set();
        choices = techniquePool;
      }
      const pick = choices[Math.floor(Math.random() * choices.length)];
      if (!pick) return;
      techniqueSeen.current.add(pick.id);
      setScreen({ name: 'technique', id: pick.id, n });
    },
    [techniquePool],
  );

  // Elo personnel du thème choisi (pour le départ « mon niveau »).
  const myLevel = useMemo(() => {
    if (!playerId) return null;
    const ratings = ratingsByKey(playerStore.history(playerId).attempts);
    const key = theme === 'mix' || theme === 'bases' ? 'all' : effSub !== 'all' ? `c:${effSub}` : `f:${theme}`;
    const r = ratings.get(key);
    return r && !r.provisional ? r.r : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, theme, effSub, screen]);
  const reviewDue = useMemo(() => (spaced ? dueNow(reviewAll, Date.now()) : reviewAll), [reviewAll, spaced]);
  const reviewFull = useMemo(() => new Set(reviewAll.filter((i) => i.full).map((i) => i.id)), [reviewAll]);
  const reviewed = useRef(new Set<string>()); // une seule tentative comptée par puzzle et par révision
  const startReview = useCallback((ids: string[]) => {
    reviewed.current = new Set();
    // Sans répétition espacée : ordre varié.
    const list = spaced ? ids : [...ids].sort(() => Math.random() - 0.5);
    if (list.length) setScreen({ name: 'review', ids: list, index: 0 });
  }, [spaced]);
  const onReviewAttempt = useCallback(
    (p: Puzzle, ok: boolean) => {
      if (reviewed.current.has(p.id)) return;
      reviewed.current.add(p.id);
      onAttempt(p, ok, 'review');
    },
    [onAttempt],
  );

  // Positions « Bases » déjà réussies (entraînement) par ce joueur.
  const basicsDone = useMemo(
    () =>
      new Set(
        playerId
          ? playerStore
              .history(playerId)
              .attempts.filter((a) => a.ok && a.p.startsWith('bases-'))
              .map((a) => a.p)
          : [],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalculé au retour à l'accueil
    [playerId, screen],
  );

  const playerName = playerStore.listPlayers().find((p) => p.id === playerId)?.name ?? null;

  if (screen.name === 'privacy') {
    return shell(<PrivacyScreen onHome={() => setScreen({ name: 'home' })} />);
  }

  if (screen.name === 'leaderboard') {
    return shell(
      <LeaderboardScreen
        signedIn={!!account.session}
        onHome={() => setScreen({ name: 'home' })}
        onAccount={() => setScreen({ name: 'progress' })}
      />,
    );
  }

  if (screen.name === 'progress') {
    return shell(
      <ProgressScreen
        store={playerStore}
        account={account}
        onPrivacy={() => setScreen({ name: 'privacy' })}
        playerId={playerId}
        onPlayerChange={changePlayer}
        onHome={() => setScreen({ name: 'home' })}
        onTrain={(family, subcategory, m = 'storm') => {
          setMode(m);
          setTheme(family as ThemeChoice);
          setSub(subcategory);
          setScreen({ name: 'rush', run: Date.now() });
        }}
      />,
    );
  }

  if (screen.name === 'review') {
    const id = screen.ids[screen.index];
    const puzzle = puzzlesById.get(id);
    const next = () =>
      setScreen(screen.index + 1 < screen.ids.length ? { name: 'review', ids: screen.ids, index: screen.index + 1 } : { name: 'home' });
    if (!puzzle) {
      next();
      return shell(null);
    }
    return shell(
      <GameScreen
        key={`${id}-${screen.index}`}
        puzzle={puzzle}
        position={{ index: screen.index, total: screen.ids.length }}
        judge={judge}
        rules={reviewFull.has(id) ? (puzzle.collection === 'bases' ? TRAINING_RULES : TECHNIQUE_RULES) : puzzle.solution ? rushRules(puzzle.solution) : TRAINING_RULES}
        backLabel="← Arrêter la révision"
        header={`🔁 Révision des erreurs · ${screen.index + 1}/${screen.ids.length} — sans chrono, la flèche montre le bon coup en cas d'erreur`}
        onAttempt={onReviewAttempt}
        onHome={() => setScreen({ name: 'home' })}
        onNext={next}
      />,
    );
  }

  if (screen.name === 'daily' && motivation.daily) {
    const d = motivation.daily;
    return shell(
      <GameScreen
        key={`daily-${d.id}`}
        puzzle={d}
        position={{ index: 0, total: 1 }}
        judge={judge}
        rules={rushRules(d.solution)}
        backLabel="← Accueil"
        header={`📌 Puzzle du jour — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · le même pour tous`}
        onAttempt={onDailyAttempt}
        onHome={() => setScreen({ name: 'home' })}
        onNext={() => setScreen({ name: 'home' })}
      />,
    );
  }

  if (screen.name === 'technique') {
    const puzzle = puzzlesById.get(screen.id);
    if (puzzle) {
      return shell(
        <GameScreen
          key={`${puzzle.id}-${screen.n}`}
          puzzle={puzzle}
          position={{ index: screen.n, total: techniquePool.length }}
          judge={judge}
          rules={TECHNIQUE_RULES}
          backLabel="← Accueil"
          header="🛠️ Technique — jouer jusqu’au bout contre la table de finales : mat, ou nulle tenue 20 coups"
          onAttempt={onTrainingAttempt}
          onHome={() => setScreen({ name: 'home' })}
          onNext={() => nextTechnique(screen.n + 1)}
        />,
      );
    }
  }

  if (screen.name === 'training') {
    return shell(
      <GameScreen
        key={BASICS[screen.index].id}
        puzzle={BASICS[screen.index]}
        position={{ index: screen.index, total: BASICS.length }}
        judge={judge}
        onAttempt={onTrainingAttempt}
        onHome={() => setScreen({ name: 'home' })}
        onNext={() => setScreen(screen.index + 1 < BASICS.length ? { name: 'training', index: screen.index + 1 } : { name: 'home' })}
      />,
    );
  }

  if (screen.name === 'rush' && pool && mode !== 'training') {
    return shell(
      <RushScreen
        key={screen.run}
        mode={mode}
        pool={pool}
        theme={themeKey}
        startRating={effectiveStart}
        scoreKey={key}
        judge={judge}
        recentlySeen={recentlySeen}
        onReview={playerId ? startReview : undefined}
        onAttempt={onRushAttempt}
        onRunEnd={onRunEnd}
        onRestart={() => setScreen({ name: 'rush', run: screen.run + 1 })}
        onHome={() => setScreen({ name: 'home' })}
      />,
    );
  }

  return shell(
    <HomeScreen
      compact={embed.embed}
      mode={mode}
      theme={theme}
      sub={sub}
      counts={counts}
      playerName={playerName}
      onProgress={() => setScreen({ name: 'progress' })}
      onPrivacy={() => setScreen({ name: 'privacy' })}
      review={playerId && lichess ? { due: reviewDue.length, total: reviewAll.length, spaced } : null}
      onReview={() => startReview(reviewDue.map((i) => i.id))}
      onSpaced={(v) => {
        setSetting('spacedRepetition', v);
        setSpaced(v);
      }}
      startRating={startRating}
      myLevel={myLevel}
      techniqueCount={lichess ? techniquePool.length : null}
      streak={motivation.streak}
      daily={motivation.daily ? { rating: motivation.daily.rating, title: motivation.daily.title, result: motivation.dailyResult } : null}
      onDaily={() => {
        dailyRecorded.current = false;
        setScreen({ name: 'daily' });
      }}
      onTechnique={() => nextTechnique(0)}
      poolSize={pool ? pool.length : null}
      loadError={loadError}
      best={mode === 'training' ? null : getBest(key)}
      basics={BASICS}
      basicsDone={basicsDone}
      onMode={setMode}
      onTheme={(t) => {
        setTheme(t);
        setSub('all');
      }}
      onSub={setSub}
      onStartRating={setStartRating}
      onStart={() => setScreen({ name: 'rush', run: Date.now() })}
      onTrain={(index) => setScreen({ name: 'training', index })}
      onLeaderboard={account.enabled ? () => setScreen({ name: 'leaderboard' }) : undefined}
    />,
  );
}
