const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const modal = document.querySelector('#productModal');
const closeModal = document.querySelector('.modal-close');
const buyButton = document.querySelector('#modalBuy');

document.querySelector('#year').textContent = new Date().getFullYear();

menuToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

document.querySelectorAll('.view-product').forEach(button => {
  button.addEventListener('click', event => {
    const card = event.target.closest('.product-card');
    document.querySelector('#modalName').textContent = card.dataset.name;
    document.querySelector('#modalPrice').textContent = card.dataset.price;
    document.querySelector('#modalWood').textContent = card.dataset.wood;
    document.querySelector('#modalSize').textContent = card.dataset.size;
    document.querySelector('#modalFinish').textContent = card.dataset.finish;
    buyButton.href = card.dataset.link;

    if (card.classList.contains('sold')) {
      buyButton.textContent = 'Sold Out';
      buyButton.removeAttribute('target');
      buyButton.href = '#shop';
    } else {
      buyButton.textContent = 'Buy This Board';
      buyButton.setAttribute('target', '_blank');
    }

    modal.showModal();
  });
});

closeModal.addEventListener('click', () => modal.close());
modal.addEventListener('click', event => {
  if (event.target === modal) modal.close();
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
