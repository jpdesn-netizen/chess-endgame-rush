import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subcategoryOf } from './core/categories';
import { CONFIG } from './core/config';
import { familyOf } from './core/material';
import type { Puzzle } from './core/types';
import { loadLichessPuzzles } from './data/lichessRepository';
import { PUZZLES_MOCK } from './data/puzzlesMock';
import { readEmbedOptions } from './embed';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen, type HomeMode, type ThemeChoice } from './screens/HomeScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { RushScreen } from './screens/RushScreen';
import { getBest, scoreKey } from './services/highScores';
import { judge } from './services/judge';
import { type Run, playerStore } from './services/playerStore';

type Screen = { name: 'home' } | { name: 'training'; index: number } | { name: 'rush'; run: number } | { name: 'progress' };

const embed = readEmbedOptions();

/** Famille et sous-catégorie calculées une fois pour toutes au chargement. */
function classify(p: Puzzle): Puzzle {
  const family = p.family ?? familyOf(p.fen);
  return { ...p, family, subcategory: subcategoryOf(p.fen, family) };
}
const BASICS = PUZZLES_MOCK.map(classify);

function buildPool(theme: ThemeChoice, sub: string, lichess: Puzzle[]): Puzzle[] {
  if (theme === 'bases') return BASICS;
  const all = [...BASICS, ...lichess];
  if (theme === 'mix') return all;
  return all.filter((p) => p.family === theme && (sub === 'all' || p.subcategory === sub));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [mode, setMode] = useState<HomeMode>(embed.mode ?? 'storm');
  const [theme, setTheme] = useState<ThemeChoice>((embed.theme as ThemeChoice) ?? 'mix');
  const [sub, setSub] = useState<string>(embed.sub ?? 'all');
  const [startRating, setStartRating] = useState<number>(embed.level ?? CONFIG.startLevels[0].rating);
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
    for (const p of [...BASICS, ...(lichess ?? [])]) {
      map.set(p.family!, (map.get(p.family!) ?? 0) + 1);
      map.set(p.subcategory!, (map.get(p.subcategory!) ?? 0) + 1);
    }
    return map;
  }, [lichess]);

  const pool = useMemo(() => (lichess ? buildPool(theme, sub, lichess) : null), [theme, sub, lichess]);
  const themeKey = sub === 'all' ? theme : `${theme}/${sub}`;
  const key = mode === 'training' ? '' : scoreKey(mode, `${playerId ?? 'invite'}|${themeKey}`, startRating);
  const shell = (content: ReactNode) => <main className="min-h-dvh bg-stone-900 text-stone-100">{content}</main>;

  const changePlayer = useCallback((id: string | null) => {
    playerStore.setCurrentPlayer(id);
    setPlayerId(id);
  }, []);

  const onAttempt = useCallback(
    (puzzle: Puzzle, success: boolean, m: 'storm' | 'streak' | 'training') => {
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

  const playerName = playerStore.listPlayers().find((p) => p.id === playerId)?.name ?? null;

  if (screen.name === 'progress') {
    return shell(
      <ProgressScreen
        store={playerStore}
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
        startRating={startRating}
        scoreKey={key}
        judge={judge}
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
      startRating={startRating}
      poolSize={pool ? pool.length : null}
      loadError={loadError}
      best={mode === 'training' ? null : getBest(key)}
      basics={BASICS}
      onMode={setMode}
      onTheme={(t) => {
        setTheme(t);
        setSub('all');
      }}
      onSub={setSub}
      onStartRating={setStartRating}
      onStart={() => setScreen({ name: 'rush', run: Date.now() })}
      onTrain={(index) => setScreen({ name: 'training', index })}
    />,
  );
}
