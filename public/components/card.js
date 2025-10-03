function createCard(options = {}) {
  const { header = '', body = '', footer = '', variant = 'default', onHover = () => {} } = options;
  const card = document.createElement('article');
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? ' card--dark' : '';
  card.className = `card card--${variant}${theme}`;
  card.setAttribute('role', 'article');
  card.innerHTML = `<header class="card-header">${header}</header><section class="card-body">${body}</section>${footer ? `<footer class="card-footer">${footer}</footer>` : ''}`;
  if (onHover) {
    card.addEventListener('mouseenter', onHover);
    card.addEventListener('mouseleave', () => {});
  }
  return card;
}

export { createCard };
module.exports = { createCard };