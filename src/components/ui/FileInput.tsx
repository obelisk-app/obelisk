import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * The hidden file picker a visible button or `<label>` opens: `type="file"`
 * and `display: none`. Nine components carried this exact element; the
 * opener (`ref.current?.click()` or a wrapping label) stays at the call site.
 */
const FileInput = forwardRef<HTMLInputElement, FileInputProps>(function FileInput({ className, ...rest }, ref) {
  return <input ref={ref} type="file" className={cn('hidden', className)} {...rest} />;
});

export default FileInput;
