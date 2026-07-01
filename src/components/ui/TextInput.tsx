import { useState, useId, type ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  icon?: ComponentType<LucideProps>;
  disabled?: boolean;
  className?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  icon: Icon,
  disabled = false,
  className = '',
}: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  const filled = value.length > 0;
  const floated = focused || filled;

  return (
    <div className={`relative ${className}`}>
      {/* Container */}
      <div className="relative">
        {/* Optional icon */}
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10">
            <Icon
              className={`w-4 h-4 transition-colors duration-200 ${
                focused ? 'text-violet-400' : 'text-white/30'
              }`}
            />
          </div>
        )}

        {/* Input */}
        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={floated ? placeholder : undefined}
          className={`
            w-full rounded-xl px-4 pt-5 pb-2
            bg-white/[0.03] text-white text-sm
            border outline-none
            transition-all duration-200
            placeholder:text-white/20
            disabled:opacity-50 disabled:cursor-not-allowed
            ${Icon ? 'pl-11' : ''}
            ${error
              ? 'border-red-500/50 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20'
              : focused
                ? 'border-violet-500/50 ring-2 ring-violet-500/20'
                : 'border-white/[0.06] hover:border-white/[0.12]'
            }
          `}
        />

        {/* Floating Label */}
        <label
          htmlFor={id}
          className={`
            absolute pointer-events-none
            transition-all duration-200 origin-left
            ${Icon ? 'left-11' : 'left-4'}
            ${floated
              ? 'top-2 text-[10px] font-medium ' + (error ? 'text-red-400' : focused ? 'text-violet-400' : 'text-white/40')
              : 'top-1/2 -translate-y-1/2 text-sm text-white/40'
            }
          `}
        >
          {label}
        </label>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{error}</p>
      )}
    </div>
  );
}
