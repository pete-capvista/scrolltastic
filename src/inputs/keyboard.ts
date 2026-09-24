import type { BeatNavigation, NavigationState } from '../interaction/navigation';

/** Scoped shortcut adapter sharing the same actions as visible controls. */
export function createKeyboardAdapter(host: HTMLElement, controls: HTMLElement, navigation: BeatNavigation) {
  let state: NavigationState;
  const unsubscribe = navigation.subscribe(value => { state = value; });
  const oldTabIndex = host.getAttribute('tabindex');
  host.tabIndex = 0;
  return {
    handle(event: KeyboardEvent): boolean {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
      const target = event.target;
      if (!(target instanceof HTMLElement) || target !== document.activeElement) return false;
      if (!host.contains(target) && !controls.contains(target)) return false;
      // Preserve editing, native widgets, and custom widgets' own arrow keys.
      if (target.isContentEditable || target.closest('input, textarea, select, audio, video, summary, [role], [aria-haspopup]')) return false;
      navigation.update();
      const forward = event.key === 'ArrowDown';
      if (!(forward ? state.canAdvance : state.canReverse) && !state.moving) return false;
      event.preventDefault();
      if (!event.repeat) (forward ? navigation.advance : navigation.reverse)();
      return true;
    },
    destroy() {
      unsubscribe();
      if (oldTabIndex === null) host.removeAttribute('tabindex');
      else host.setAttribute('tabindex', oldTabIndex);
    },
  };
}
