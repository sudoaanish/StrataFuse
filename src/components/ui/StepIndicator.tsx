import { Check } from 'lucide-react';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  completedSteps: Set<number>;
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center w-full px-8">
      {steps.map((label, index) => {
        const isActive = index === currentStep;
        const isCompleted = completedSteps.has(index);
        const isLast = index === steps.length - 1;

        return (
          <div key={label} className="flex items-center">
            {/* Step dot + label */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  relative flex items-center justify-center w-9 h-9 rounded-full
                  transition-all duration-300
                  ${isCompleted
                    ? 'bg-violet-500 shadow-[0_0_16px_rgba(139,92,246,0.4)]'
                    : isActive
                      ? 'bg-violet-500 ring-4 ring-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.5)]'
                      : 'bg-white/10'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                ) : (
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? 'text-white' : 'text-white/40'
                    }`}
                  >
                    {index + 1}
                  </span>
                )}
              </div>

              <span
                className={`
                  mt-2 text-xs font-medium whitespace-nowrap
                  transition-colors duration-300
                  ${isActive ? 'text-white' : isCompleted ? 'text-white/60' : 'text-white/30'}
                `}
              >
                {label}
              </span>
            </div>

            {/* Connecting line */}
            {!isLast && (
              <div className="relative w-16 mx-2 -mt-5">
                <div className="h-px bg-white/10 w-full" />
                <div
                  className={`
                    absolute top-0 left-0 h-px bg-violet-500 transition-all duration-500
                    ${isCompleted ? 'w-full' : 'w-0'}
                  `}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
