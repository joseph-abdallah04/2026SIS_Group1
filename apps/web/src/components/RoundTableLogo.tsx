import logoUrl from '@roundtable/shared/assets/roundtable-logo.svg';

interface RoundTableLogoProps {
  className?: string;
}

export function RoundTableLogo({ className = 'h-7 w-auto shrink-0' }: RoundTableLogoProps) {
  return (
    <img
      src={logoUrl}
      alt="RoundTable"
      className={className}
      draggable={false}
    />
  );
}
