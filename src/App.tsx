import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from './core/config';
import { familyOf } from './core/material';
import type { Puzzle } from './core/types';
import { loadLichessPuzzles } from './data/lichessRepository';
import { PUZZLES_MOCK } from './data/puzzlesMock';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen, type HomeMode, type ThemeChoice } from './screens/HomeScreen';
import { RushScreen } from './screens/RushScreen';
import { getBest, scoreKey } from './services/highScores';
import { tablebase } from './services/tablebaseClient';

type Screen = { name: 'home' } | { name: 'training'; index: number } | { name: 'rush'; run: number };

const lookup = tablebase.lookup;
const prefetch = tablebase.prefetch;

function buildPool(theme: ThemeChoice, lichess: Puzzle[]): Puzzle[] {
  const basics = PUZZLES_MOCK;
  if (theme === 'bases') return basics;
  if (theme === 'mix') return [...basics, ...lichess];
  return [...basics, ...lichess].filter((p) => (p.family ?? familyOf(p.fen)) === theme);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [mode, setMode] = useState<HomeMode>('storm');
  const [theme, setTheme] = useState<ThemeChoice>('mix');
  const [startRating, setStartRating] = useState<number>(CONFIG.startLevels[0].rating);
  const [lichess, setLichess] = useState<Puzzle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadLichessPuzzles()
      .then(setLichess)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const pool = useMemo(() => (lichess ? buildPool(theme, lichess) : null), [theme, lichess]);
  const key = mode === 'training' ? '' : scoreKey(mode, theme, startRating);

  if (screen.name === 'training') {
    const puzzles = PUZZLES_MOCK;
    return (
      <main className="min-h-screen bg-stone-900 text-stone-100">
        <GameScreen
          key={puzzles[screen.index].id}
          puzzle={puzzles[screen.index]}
          position={{ index: screen.index, total: puzzles.length }}
          lookup={lookup}
          prefetch={prefetch}
          onHome={() => setScreen({ name: 'home' })}
          onNext={() => setScreen(screen.index + 1 < puzzles.length ? { name: 'training', index: screen.index + 1 } : { name: 'home' })}
        />
      </main>
    );
  }

  if (screen.name === 'rush' && pool && mode !== 'training') {
    return (
      <main className="min-h-screen bg-stone-900 text-stone-100">
        <RushScreen
          key={screen.run}
          mode={mode}
          pool={pool}
          startRating={startRating}
          scoreKey={key}
          lookup={lookup}
          prefetch={prefetch}
          onRestart={() => setScreen({ name: 'rush', run: screen.run + 1 })}
          onHome={() => setScreen({ name: 'home' })}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-900 text-stone-100">
      <HomeScreen
        mode={mode}
        theme={theme}
        startRating={startRating}
        poolSize={pool ? pool.length : null}
        loadError={loadError}
        best={mode === 'training' ? null : getBest(key)}
        basics={PUZZLES_MOCK}
        onMode={setMode}
        onTheme={setTheme}
        onStartRating={setStartRating}
        onStart={() => setScreen({ name: 'rush', run: Date.now() })}
        onTrain={(index) => setScreen({ name: 'training', index })}
      />
    </main>
  );
}
