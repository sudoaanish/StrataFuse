interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ label, description, checked, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <label
      className={`
        flex items-start gap-4 group
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Toggle Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 rounded-full
          transition-all duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:ring-offset-2 focus:ring-offset-transparent
          ${checked ? 'bg-violet-500' : 'bg-white/10'}
        `}
      >
        {/* Knob */}
        <span
          className={`
            inline-block h-5 w-5 rounded-full bg-white shadow-lg
            transform transition-transform duration-200 ease-in-out mt-0.5
            ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}
          `}
        />
      </button>

      {/* Labels */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-white leading-6">{label}</span>
        {description && (
          <span className="text-xs text-white/50 mt-0.5 leading-relaxed">{description}</span>
        )}
      </div>
    </label>
  );
}
