interface MascotPlaceholderProps {
  mood?: "welcome" | "cheer";
}

export function MascotPlaceholder({
  mood = "welcome",
}: MascotPlaceholderProps) {
  return (
    <span
      className="mascot-placeholder"
      data-mood={mood}
      role="img"
      aria-label="رمز مؤقت لشخصية حَرْف"
    >
      <span aria-hidden="true">ح</span>
    </span>
  );
}
