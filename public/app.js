(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    }));
  }

  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date());
  });

  document.querySelectorAll('form[data-enquiry-form]').forEach((form) => {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const name = form.elements.name?.value?.trim() || 'دوست عزیز';
      status.textContent = `ممنون ${name}؛ اطلاعات شما آماده بررسی است. برای تکمیل استعلام، با ۰۹۱۷۰۱۶۸۰۳۷ تماس بگیرید.`;
      status.classList.add('is-visible');
      status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  document.querySelectorAll('form[data-payment-form]').forEach((form) => {
    const status = form.querySelector('.payment-status');
    const submit = form.querySelector('.payment-submit');
    const originalLabel = submit?.innerHTML || '';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const data = Object.fromEntries(new FormData(form).entries());
      status.classList.remove('is-visible');
      submit.disabled = true;
      submit.innerHTML = 'در حال اتصال به درگاه…';
      try {
        const response = await fetch('/api/payments/zarinpal/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.redirectUrl) {
          throw new Error(result.message || 'درخواست پرداخت آماده نشد.');
        }
        window.location.assign(result.redirectUrl);
      } catch (error) {
        status.textContent = error.message || 'درخواست پرداخت انجام نشد. لطفاً تماس بگیرید.';
        status.classList.add('is-visible');
        submit.disabled = false;
        submit.innerHTML = originalLabel;
      }
    });
  });
})();
