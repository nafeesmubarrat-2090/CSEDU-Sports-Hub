'use client'

type ConfirmButtonProps = {
  message: string
  children: React.ReactNode
  className?: string
}

// A submit button that asks for confirmation before letting the form's
// server action run. Used for destructive actions like regenerating a bracket,
// which wipes all existing matches and scores.
export default function ConfirmButton({ message, children, className }: ConfirmButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
