'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Each emoji carries lowercase, accent-free keywords in English AND Spanish
// so search works regardless of the user's language. `normalize` at query
// time strips diacritics so typing "corazon" matches "corazón".
interface EmojiEntry {
  char: string;
  keywords: string[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const EMOJI_CATEGORIES: Record<string, EmojiEntry[]> = {
  Smileys: [
    { char: '😀', keywords: ['grinning', 'smile', 'happy', 'face', 'sonrisa', 'feliz', 'cara', 'contento'] },
    { char: '😃', keywords: ['smile', 'happy', 'joy', 'face', 'sonrisa', 'feliz', 'alegre', 'cara'] },
    { char: '😄', keywords: ['smile', 'happy', 'laugh', 'face', 'sonrisa', 'risa', 'feliz', 'cara'] },
    { char: '😁', keywords: ['beaming', 'smile', 'grin', 'sonrisa', 'dientes', 'feliz'] },
    { char: '😆', keywords: ['laugh', 'haha', 'xd', 'risa', 'carcajada'] },
    { char: '😅', keywords: ['sweat', 'laugh', 'relief', 'sudor', 'alivio', 'risa'] },
    { char: '🤣', keywords: ['rofl', 'laugh', 'rolling', 'risa', 'revolcando', 'carcajada'] },
    { char: '😂', keywords: ['joy', 'tears', 'laugh', 'lol', 'risa', 'lagrimas', 'llorar'] },
    { char: '🙂', keywords: ['slight', 'smile', 'face', 'leve', 'sonrisa', 'cara'] },
    { char: '🙃', keywords: ['upside', 'down', 'face', 'reves', 'cabeza', 'abajo', 'cara'] },
    { char: '😉', keywords: ['wink', 'face', 'guino', 'ojo', 'cara'] },
    { char: '😊', keywords: ['blush', 'smile', 'happy', 'rubor', 'sonrojar', 'feliz', 'sonrisa'] },
    { char: '😇', keywords: ['halo', 'angel', 'innocent', 'aureola', 'inocente', 'santo'] },
    { char: '🥰', keywords: ['love', 'hearts', 'smile', 'amor', 'enamorado', 'corazones'] },
    { char: '😍', keywords: ['heart', 'eyes', 'love', 'corazon', 'ojos', 'enamorado', 'amor'] },
    { char: '🤩', keywords: ['star', 'struck', 'wow', 'estrella', 'asombrado', 'impresionado'] },
    { char: '😘', keywords: ['kiss', 'love', 'face', 'beso', 'amor', 'cara'] },
    { char: '😋', keywords: ['yum', 'tongue', 'tasty', 'lengua', 'rico', 'delicioso', 'sabroso'] },
    { char: '😛', keywords: ['tongue', 'face', 'lengua', 'cara'] },
    { char: '😜', keywords: ['wink', 'tongue', 'silly', 'guino', 'lengua', 'tonto'] },
    { char: '🤪', keywords: ['zany', 'crazy', 'silly', 'loco', 'tonto', 'chiflado'] },
    { char: '🤗', keywords: ['hug', 'face', 'abrazo', 'cara'] },
    { char: '🤔', keywords: ['thinking', 'hmm', 'face', 'pensando', 'pensar', 'duda'] },
    { char: '🤨', keywords: ['raised', 'eyebrow', 'suspicious', 'ceja', 'levantada', 'sospecha', 'duda'] },
    { char: '😐', keywords: ['neutral', 'meh', 'face', 'neutral', 'cara', 'serio'] },
    { char: '😑', keywords: ['expressionless', 'face', 'sin', 'expresion', 'cara'] },
    { char: '😶', keywords: ['silent', 'no', 'mouth', 'silencio', 'boca', 'callado'] },
    { char: '😏', keywords: ['smirk', 'face', 'sonrisa', 'picara', 'burla'] },
    { char: '😒', keywords: ['unamused', 'meh', 'aburrido', 'disgusto'] },
    { char: '🙄', keywords: ['eye', 'roll', 'rolling', 'ojos', 'rodar', 'fastidio'] },
    { char: '😬', keywords: ['grimace', 'awkward', 'mueca', 'incomodo', 'tension'] },
    { char: '😌', keywords: ['relieved', 'calm', 'aliviado', 'calmado', 'tranquilo'] },
    { char: '😔', keywords: ['pensive', 'sad', 'pensativo', 'triste'] },
    { char: '😪', keywords: ['sleepy', 'tired', 'sueno', 'cansado', 'dormir'] },
    { char: '😴', keywords: ['sleep', 'zzz', 'dormir', 'dormido', 'sueno'] },
    { char: '😷', keywords: ['mask', 'sick', 'mascara', 'barbijo', 'enfermo', 'cubrebocas'] },
    { char: '🤒', keywords: ['sick', 'thermometer', 'ill', 'enfermo', 'termometro', 'fiebre'] },
    { char: '🤕', keywords: ['hurt', 'bandage', 'injured', 'herido', 'venda', 'lastimado'] },
    { char: '🥳', keywords: ['party', 'celebrate', 'hat', 'fiesta', 'celebrar', 'gorro', 'cumpleanos'] },
    { char: '😎', keywords: ['cool', 'sunglasses', 'lentes', 'gafas', 'sol', 'chevere', 'genial'] },
    { char: '🤓', keywords: ['nerd', 'glasses', 'geek', 'nerd', 'lentes', 'gafas', 'empollon'] },
    { char: '🧐', keywords: ['monocle', 'inspect', 'monoculo', 'inspeccionar', 'detective'] },
    { char: '😕', keywords: ['confused', 'face', 'confundido', 'cara'] },
    { char: '🙁', keywords: ['frown', 'sad', 'triste', 'cara'] },
    { char: '😮', keywords: ['open', 'mouth', 'wow', 'boca', 'abierta', 'asombro'] },
    { char: '😲', keywords: ['astonished', 'shock', 'asombrado', 'sorprendido', 'shock'] },
    { char: '😳', keywords: ['flushed', 'blush', 'sonrojado', 'verguenza', 'rubor'] },
    { char: '🥺', keywords: ['pleading', 'puppy', 'eyes', 'suplicando', 'cachorro', 'ojos'] },
    { char: '😢', keywords: ['cry', 'sad', 'tear', 'llorar', 'triste', 'lagrima'] },
    { char: '😭', keywords: ['sob', 'cry', 'bawl', 'sollozar', 'llorar', 'llanto'] },
    { char: '😱', keywords: ['scream', 'shock', 'fear', 'grito', 'miedo', 'asustado'] },
    { char: '😨', keywords: ['fearful', 'scared', 'miedo', 'asustado'] },
    { char: '😰', keywords: ['anxious', 'sweat', 'ansioso', 'sudor', 'nervioso'] },
    { char: '😡', keywords: ['angry', 'mad', 'rage', 'enojado', 'enfadado', 'furioso', 'rabia'] },
    { char: '😠', keywords: ['angry', 'mad', 'enojado', 'enfadado'] },
  ],
  Gestures: [
    { char: '👍', keywords: ['thumbs', 'up', 'yes', 'ok', 'like', 'pulgar', 'arriba', 'bien', 'si', 'aprobado', 'dale'] },
    { char: '👎', keywords: ['thumbs', 'down', 'no', 'dislike', 'pulgar', 'abajo', 'mal', 'rechazo'] },
    { char: '👌', keywords: ['ok', 'hand', 'perfect', 'mano', 'perfecto', 'genial'] },
    { char: '🤌', keywords: ['pinched', 'fingers', 'italian', 'dedos', 'italiano', 'pellizco'] },
    { char: '🤏', keywords: ['pinch', 'small', 'pellizco', 'pequeno', 'poquito'] },
    { char: '✌️', keywords: ['peace', 'victory', 'paz', 'victoria', 'dos'] },
    { char: '🤞', keywords: ['crossed', 'fingers', 'luck', 'cruzados', 'dedos', 'suerte'] },
    { char: '🤟', keywords: ['love', 'you', 'rock', 'te', 'amo', 'amor', 'senas'] },
    { char: '🤘', keywords: ['rock', 'horns', 'metal', 'rock', 'cuernos', 'metal'] },
    { char: '🤙', keywords: ['call', 'me', 'shaka', 'llamame', 'llamar', 'shaka'] },
    { char: '👈', keywords: ['point', 'left', 'senalar', 'izquierda', 'dedo'] },
    { char: '👉', keywords: ['point', 'right', 'senalar', 'derecha', 'dedo'] },
    { char: '👆', keywords: ['point', 'up', 'senalar', 'arriba', 'dedo'] },
    { char: '👇', keywords: ['point', 'down', 'senalar', 'abajo', 'dedo'] },
    { char: '☝️', keywords: ['index', 'up', 'one', 'indice', 'arriba', 'uno'] },
    { char: '👋', keywords: ['wave', 'hi', 'hello', 'bye', 'hola', 'adios', 'saludar', 'chau'] },
    { char: '🖐️', keywords: ['hand', 'splayed', 'five', 'mano', 'abierta', 'cinco'] },
    { char: '✋', keywords: ['raised', 'hand', 'stop', 'high', 'five', 'mano', 'alta', 'pare', 'cinco', 'alto'] },
    { char: '🖖', keywords: ['vulcan', 'spock', 'vulcano', 'spock', 'startrek'] },
    { char: '👏', keywords: ['clap', 'applause', 'aplauso', 'aplaudir', 'palmas'] },
    { char: '🙌', keywords: ['hands', 'raised', 'celebrate', 'praise', 'manos', 'arriba', 'celebrar', 'alabar'] },
    { char: '👐', keywords: ['open', 'hands', 'manos', 'abiertas'] },
    { char: '🤲', keywords: ['palms', 'up', 'palmas', 'arriba', 'rezar'] },
    { char: '🤝', keywords: ['handshake', 'deal', 'apreton', 'manos', 'trato', 'acuerdo'] },
    { char: '🙏', keywords: ['pray', 'please', 'thanks', 'rezar', 'rogar', 'porfavor', 'gracias'] },
    { char: '💪', keywords: ['muscle', 'flex', 'strong', 'musculo', 'fuerza', 'fuerte', 'biceps'] },
    { char: '🫶', keywords: ['heart', 'hands', 'love', 'corazon', 'manos', 'amor'] },
    { char: '❤️', keywords: ['heart', 'love', 'red', 'corazon', 'amor', 'rojo'] },
    { char: '🧡', keywords: ['heart', 'orange', 'corazon', 'naranja'] },
    { char: '💛', keywords: ['heart', 'yellow', 'corazon', 'amarillo'] },
    { char: '💚', keywords: ['heart', 'green', 'corazon', 'verde'] },
    { char: '💙', keywords: ['heart', 'blue', 'corazon', 'azul'] },
    { char: '💜', keywords: ['heart', 'purple', 'corazon', 'morado', 'violeta'] },
    { char: '🖤', keywords: ['heart', 'black', 'corazon', 'negro'] },
    { char: '🤍', keywords: ['heart', 'white', 'corazon', 'blanco'] },
    { char: '🤎', keywords: ['heart', 'brown', 'corazon', 'marron', 'cafe'] },
    { char: '💔', keywords: ['broken', 'heart', 'corazon', 'roto', 'partido'] },
    { char: '💕', keywords: ['hearts', 'love', 'corazones', 'amor'] },
    { char: '💖', keywords: ['sparkling', 'heart', 'love', 'corazon', 'brillante', 'amor'] },
  ],
  Objects: [
    { char: '🔥', keywords: ['fire', 'lit', 'hot', 'fuego', 'llama', 'caliente', 'genial'] },
    { char: '✨', keywords: ['sparkles', 'shine', 'brillos', 'destellos', 'magia'] },
    { char: '⭐', keywords: ['star', 'estrella'] },
    { char: '🌟', keywords: ['glowing', 'star', 'estrella', 'brillante'] },
    { char: '💫', keywords: ['dizzy', 'star', 'mareo', 'estrella'] },
    { char: '⚡', keywords: ['lightning', 'bolt', 'zap', 'rayo', 'relampago', 'electricidad'] },
    { char: '☀️', keywords: ['sun', 'sunny', 'sol', 'soleado'] },
    { char: '🌙', keywords: ['moon', 'night', 'luna', 'noche'] },
    { char: '☁️', keywords: ['cloud', 'weather', 'nube', 'clima'] },
    { char: '🌈', keywords: ['rainbow', 'pride', 'arcoiris', 'orgullo'] },
    { char: '💧', keywords: ['droplet', 'water', 'gota', 'agua'] },
    { char: '🎉', keywords: ['party', 'tada', 'celebrate', 'fiesta', 'celebrar', 'cumpleanos'] },
    { char: '🎊', keywords: ['confetti', 'celebrate', 'confeti', 'celebrar', 'fiesta'] },
    { char: '🎁', keywords: ['gift', 'present', 'regalo', 'presente'] },
    { char: '🏆', keywords: ['trophy', 'win', 'trofeo', 'ganar', 'victoria', 'copa'] },
    { char: '🥇', keywords: ['gold', 'medal', 'first', 'oro', 'medalla', 'primero'] },
    { char: '🎯', keywords: ['target', 'bullseye', 'dart', 'diana', 'objetivo', 'tiro'] },
    { char: '🎮', keywords: ['video', 'game', 'gaming', 'videojuego', 'juego', 'control', 'gamer'] },
    { char: '📱', keywords: ['phone', 'mobile', 'telefono', 'celular', 'movil'] },
    { char: '💻', keywords: ['laptop', 'computer', 'computadora', 'portatil', 'notebook', 'pc', 'ordenador'] },
    { char: '⌨️', keywords: ['keyboard', 'teclado'] },
    { char: '🖱️', keywords: ['mouse', 'computer', 'raton', 'mouse', 'computadora'] },
    { char: '💾', keywords: ['floppy', 'disk', 'save', 'disquete', 'guardar'] },
    { char: '📷', keywords: ['camera', 'photo', 'camara', 'foto'] },
    { char: '🎥', keywords: ['movie', 'camera', 'film', 'pelicula', 'camara', 'cine'] },
    { char: '💡', keywords: ['idea', 'lightbulb', 'idea', 'bombilla', 'foco', 'bombita'] },
    { char: '📚', keywords: ['books', 'read', 'libros', 'leer', 'estudio'] },
    { char: '📖', keywords: ['book', 'open', 'read', 'libro', 'abierto', 'leer'] },
    { char: '📝', keywords: ['memo', 'note', 'write', 'nota', 'escribir', 'apunte'] },
    { char: '✏️', keywords: ['pencil', 'write', 'lapiz', 'escribir'] },
    { char: '📌', keywords: ['pin', 'pushpin', 'chincheta', 'alfiler', 'fijar'] },
    { char: '🔗', keywords: ['link', 'chain', 'enlace', 'cadena', 'link'] },
    { char: '🔒', keywords: ['lock', 'locked', 'candado', 'cerrado', 'bloqueado'] },
    { char: '🔑', keywords: ['key', 'llave', 'clave'] },
    { char: '🛠️', keywords: ['tools', 'hammer', 'wrench', 'herramientas', 'martillo', 'llave'] },
    { char: '⚙️', keywords: ['gear', 'settings', 'engranaje', 'ajustes', 'configuracion'] },
  ],
  Food: [
    { char: '🍎', keywords: ['apple', 'red', 'fruit', 'manzana', 'roja', 'fruta'] },
    { char: '🍊', keywords: ['orange', 'fruit', 'naranja', 'fruta'] },
    { char: '🍋', keywords: ['lemon', 'fruit', 'limon', 'fruta'] },
    { char: '🍌', keywords: ['banana', 'fruit', 'banana', 'platano', 'fruta'] },
    { char: '🍉', keywords: ['watermelon', 'fruit', 'sandia', 'fruta'] },
    { char: '🍇', keywords: ['grapes', 'fruit', 'uvas', 'fruta'] },
    { char: '🍓', keywords: ['strawberry', 'fruit', 'frutilla', 'fresa', 'fruta'] },
    { char: '🍑', keywords: ['peach', 'fruit', 'durazno', 'melocoton', 'fruta'] },
    { char: '🍍', keywords: ['pineapple', 'fruit', 'ananas', 'pina', 'fruta'] },
    { char: '🥥', keywords: ['coconut', 'coco'] },
    { char: '🥝', keywords: ['kiwi', 'fruit', 'kiwi', 'fruta'] },
    { char: '🍅', keywords: ['tomato', 'tomate'] },
    { char: '🍆', keywords: ['eggplant', 'aubergine', 'berenjena'] },
    { char: '🥑', keywords: ['avocado', 'aguacate', 'palta'] },
    { char: '🥦', keywords: ['broccoli', 'brocoli'] },
    { char: '🥕', keywords: ['carrot', 'zanahoria'] },
    { char: '🌽', keywords: ['corn', 'maiz', 'choclo', 'elote'] },
    { char: '🌶️', keywords: ['pepper', 'spicy', 'hot', 'aji', 'picante', 'chile'] },
    { char: '🍞', keywords: ['bread', 'toast', 'pan', 'tostada'] },
    { char: '🧀', keywords: ['cheese', 'queso'] },
    { char: '🥚', keywords: ['egg', 'huevo'] },
    { char: '🍳', keywords: ['egg', 'fried', 'cooking', 'huevo', 'frito', 'cocinar'] },
    { char: '🥓', keywords: ['bacon', 'tocino', 'panceta'] },
    { char: '🍔', keywords: ['burger', 'hamburger', 'hamburguesa'] },
    { char: '🍟', keywords: ['fries', 'chips', 'papas', 'fritas', 'patatas'] },
    { char: '🍕', keywords: ['pizza'] },
    { char: '🌮', keywords: ['taco'] },
    { char: '🌯', keywords: ['burrito'] },
    { char: '🍝', keywords: ['spaghetti', 'pasta', 'fideos', 'espagueti'] },
    { char: '🍣', keywords: ['sushi'] },
    { char: '🍰', keywords: ['cake', 'slice', 'torta', 'pastel', 'tarta'] },
    { char: '🎂', keywords: ['birthday', 'cake', 'cumpleanos', 'torta', 'pastel'] },
    { char: '🍪', keywords: ['cookie', 'galleta', 'galletita'] },
    { char: '🍩', keywords: ['donut', 'doughnut', 'dona', 'rosquilla'] },
    { char: '🍫', keywords: ['chocolate'] },
    { char: '🍿', keywords: ['popcorn', 'pochoclo', 'palomitas', 'cabritas'] },
    { char: '☕', keywords: ['coffee', 'hot', 'drink', 'cafe', 'bebida', 'caliente'] },
    { char: '🍵', keywords: ['tea', 'te', 'mate'] },
    { char: '🥤', keywords: ['soda', 'drink', 'cup', 'refresco', 'bebida', 'gaseosa', 'vaso'] },
    { char: '🍺', keywords: ['beer', 'cerveza', 'birra'] },
    { char: '🍷', keywords: ['wine', 'vino'] },
    { char: '🥂', keywords: ['champagne', 'clink', 'cheers', 'champagne', 'brindis', 'salud'] },
  ],
};

const CATEGORIES = Object.keys(EMOJI_CATEGORIES);

// Pre-normalized flat list used for search (avoids re-normalizing per keystroke)
interface SearchableEmoji extends EmojiEntry {
  haystack: string;
}

const ALL_EMOJI: SearchableEmoji[] = CATEGORIES.flatMap((c) =>
  EMOJI_CATEGORIES[c].map((e) => ({
    ...e,
    haystack: e.keywords.map(normalize).join(' '),
  })),
);

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [active, setActive] = useState(CATEGORIES[0]);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const results = useMemo<EmojiEntry[]>(() => {
    const q = normalize(query.trim());
    if (!q) return EMOJI_CATEGORIES[active];
    const terms = q.split(/\s+/);
    return ALL_EMOJI.filter((e) => terms.every((t) => e.haystack.includes(t)));
  }, [query, active]);

  const searching = query.trim().length > 0;

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-2 mb-2 w-72 bg-lc-dark border border-lc-border rounded-xl shadow-lg overflow-hidden z-50"
      data-testid="emoji-picker"
    >
      <div className="p-2 border-b border-lc-border">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar emoji... / Search emoji..."
          className="w-full px-2 py-1.5 text-xs bg-lc-border/40 rounded text-lc-white placeholder-lc-muted outline-none focus:bg-lc-border/60"
          data-testid="emoji-search"
        />
      </div>
      {!searching && (
        <div className="flex border-b border-lc-border">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                active === c ? 'text-lc-green border-b-2 border-lc-green' : 'text-lc-muted hover:text-lc-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto p-2 grid grid-cols-8 gap-1">
        {results.length === 0 && searching ? (
          <p className="col-span-8 text-center text-xs text-lc-muted py-4">
            Sin resultados / No results
          </p>
        ) : (
          results.map((e, i) => (
            <button
              key={`${e.char}-${i}`}
              onClick={() => onSelect(e.char)}
              className="w-8 h-8 flex items-center justify-center text-xl hover:bg-lc-border/60 rounded transition-colors"
              title={e.keywords[0]}
            >
              {e.char}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
