import { cva, type VariantProps } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive min-h-[24px] min-w-[24px]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 min-h-[44px] min-w-[44px] md:min-h-[24px] md:min-w-[24px]',
        link:
          'text-primary underline-offset-4 hover:underline min-h-[44px] md:min-h-[24px] p-2'
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3 min-h-[44px] md:min-h-[40px]',
        sm:
          'h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 min-h-[44px] md:min-h-[36px]',
        lg: 'h-12 rounded-md px-6 has-[>svg]:px-4 min-h-[48px]',
        icon:
          'size-11 md:size-9 min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px]'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
