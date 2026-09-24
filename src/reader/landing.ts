export function renderLanding(root: HTMLElement) {
  const landing = document.createElement('div');
  landing.className = 'landing';

  const logo = document.createElement('img');
  logo.className = 'landing-logo';
  logo.src = '/branding/scrolltastic-logo.png';
  logo.alt = 'Scrolltastic';
  logo.width = 1254;
  logo.height = 1254;
  logo.fetchPriority = 'high';

  const content = document.createElement('div');
  content.className = 'landing-content';
  const heading = document.createElement('h1');
  heading.textContent = 'Every story starts with a link.';
  const description = document.createElement('p');
  description.textContent = 'Open a story link or scan its QR code to begin reading.';

  content.append(heading, description);
  landing.append(logo, content);
  root.replaceChildren(landing);
}
