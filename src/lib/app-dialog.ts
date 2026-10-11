let loading: Promise<void> | undefined;
type DialogWindow = Window & { appConfirm?: (message: string) => Promise<boolean> };
export async function appConfirm(message: string): Promise<boolean> {
  const target = window as DialogWindow;
  if (!target.appConfirm) {
    loading ||= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/app-dialog.js';
      script.onload = () => resolve();
      script.onerror = () => { loading = undefined; reject(new Error('تعذر تحميل نافذة التأكيد')); };
      document.head.appendChild(script);
    });
    await loading;
  }
  return target.appConfirm!(message);
}
