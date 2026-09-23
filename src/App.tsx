import { useState } from 'react';
import { PUZZLES_MOCK } from './data/puzzlesMock';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { tablebase } from './services/tablebaseClient';

type Screen = { name: 'home' } | { name: 'game'; index: number };

const lookup = tablebase.lookup;
const prefetch = tablebase.prefetch;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const puzzles = PUZZLES_MOCK;

  return (
    <main className="min-h-screen bg-stone-900 text-stone-100">
      {screen.name === 'home' ? (
        <HomeScreen puzzles={puzzles} onPlay={(index) => setScreen({ name: 'game', index })} />
      ) : (
        <GameScreen
          // La clé force un nouveau composant (et un état neuf) à chaque puzzle.
          key={puzzles[screen.index].id}
          puzzle={puzzles[screen.index]}
          position={{ index: screen.index, total: puzzles.length }}
          lookup={lookup}
          prefetch={prefetch}
          onHome={() => setScreen({ name: 'home' })}
          onNext={() =>
            setScreen(screen.index + 1 < puzzles.length ? { name: 'game', index: screen.index + 1 } : { name: 'home' })
          }
        />
      )}
    </main>
  );
}
