class StripeElements {
  constructor() {
    this.form = document.getElementsByClassName('create_account')[0];
    this.tokenField = document.querySelector('[data-external-account]');
    this.stripe = Stripe(stripe_pk);
    this.elements = this.stripe.elements();
    this.currency = document.querySelector('[data-card-currency]').value;

    this.cardElement = document.querySelector('#card-element');
    if (typeof this.cardElement == 'undefined' || this.cardElement == null) {
      return;
    }
    this.configure();
  }

  configure() {
    // Custom styling can be passed to options when creating an Element.

    var style = {
      base: {
        color: '#32325d',
        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '16px',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#fa755a',
        iconColor: '#fa755a',
      },
    };

    // Create an instance of the card Element.
    this.card = this.elements.create('card', {style});

    // Add an instance of the card Element into the `card-element` <div>.
    this.card.mount('#card-element');
    console.log('mounted');

    this.validateForm();
  }

  getToken() {
    return new Promise((resolve, reject) => {
      this.stripe
        .createToken(this.card, {
          currency: this.currency,
          default_for_currency: true,
        })
        .then(
          function(result) {
            if (result.error) {
              // Inform the customer that there was an error.
              const errorElement = document.getElementById('card-errors');
              errorElement.textContent = result.error.message;
              reject();
            } else {
              this.tokenField.value = result.token.id;
              resolve();
            }
          }.bind(this),
        );
    });
  }

  validateForm() {
    this.card.addEventListener('change', ({error}) => {
      const displayError = document.getElementById('card-errors');
      if (error) {
        displayError.textContent = error.message;
      } else {
        displayError.textContent = '';
      }
    });
  }
}

class StripePerson {
  constructor(container) {
    console.log('Processing Person');
    this.container = container;
    this.personId = this.container.dataset.person;
    this.personGatewayId = this.container.dataset.personGatewayId;
    this.accountId = this.container.dataset.account;
    this.individual = this.container.dataset.person == 'individual';
    this.processInputData();
    this.clearErrors();

    const documentInputs = this.container.querySelectorAll(
      '[data-document]:not(:disabled)',
    );
    let documentPromises = [];

    for (i = 0; i < documentInputs.length; ++i) {
      let documentData = documentInputs[i].dataset.document;
      documentPromises.push(this.setPersonDocument(documentData));
    }

    return new Promise((resolve, reject) => {
      Promise.all(documentPromises).then(
        () => {
          this.removeEmptyValues(this.personData);
          console.log('this.personData', this.personData);
          stripe.createToken('person', this.personData).then(
            function(result) {
              if (result.error) {
                console.log('Person Error', result.error);
                let inputField = this.container.querySelector(
                  `[data-name="${result.error.param.match(/person\[\w*\]/)}"]`,
                );
                if (typeof inputField != 'undefined' && inputField != null) {
                  inputField.classList.add('is-invalid');
                }
                this.container.querySelector('.errors').textContent =
                  result.error.message;

                this.container.querySelector('.errors').scrollIntoView();
                reject();
              } else {
                this.token = result.token.id;
                this.savePerson()
                  .then(resp => resp.json())
                  .then(
                    function(result) {
                      if (result.status == 200) {
                        resolve();
                      } else {
                        this.container.querySelector(
                          '.errors',
                        ).textContent = JSON.parse(result.body).error.message;
                        reject();
                      }
                    }.bind(this),
                  );
              }
            }.bind(this),
          );
        },
        error => {
          console.log('Error person promise', error);
          reject();
        },
      );
    });
  }

  clearErrors() {
    var elems = this.container.querySelectorAll('.is-invalid');

    [].forEach.call(elems, function(el) {
      el.classList.remove('is-invalid');
    });
  }

  savePerson() {
    const data = new FormData();
    data.append('person_token', this.token);
    data.append('account_id', this.accountId);
    data.append('person_id', this.personId);
    data.append('person_gateway_id', this.personGatewayId);

    return fetch('/payments/api/persons.json', {
      method: 'POST',
      body: data,
    });
  }

  setPersonDocument(documentData) {
    let documentFile = this.container.querySelector(
      `[data-document="${documentData}"]`,
    ).files[0];
    if (documentFile == undefined) return Promise.resolve();

    return this.processFile(documentFile, documentData);
  }

  setCompanyDocument(documentData) {
    let companyContainer = document.querySelector('.company:not(:disabled)');
    let documentFile = companyContainer.querySelector(
      `[data-document="${documentData}"]`,
    ).files[0];
    if (documentFile == undefined) return Promise.resolve();

    return this.processFile(documentFile, documentData);
  }

  setDocumentToken(documentData, token) {
    console.log('Setting document token', documentData, token);
    var [documentType, documentSide] = documentData.split('-');

    if (this.personData.person.verification == undefined) {
      this.personData.person.verification = {};
    }

    if (this.personData.person.verification['document'] == undefined) {
      this.personData.person.verification['document'] = {};
    }
    if (
      this.personData.person.verification['additional_document'] == undefined
    ) {
      this.personData.person.verification['additional_document'] = {};
    }

    this.personData.person.verification[documentType][documentSide] = token;
  }

  processFile(file, documentData) {
    console.log('Processing file with', stripe._apiKey);
    const data = new FormData();
    data.append('file', file);
    if (documentData.includes('company')) {
      data.append('purpose', 'additional_verification');
    } else {
      data.append('purpose', 'identity_document');
    }
    console.log('REQUEST', data);

    return new Promise((resolve, reject) => {
      fetch('https://uploads.stripe.com/v1/files', {
        method: 'POST',
        headers: {Authorization: `Bearer ${stripe._apiKey}`},
        body: data,
      })
        .then(fileResponse => fileResponse.json())
        .then(
          function(json) {
            this.setDocumentToken(documentData, json.id);
            resolve();
          }.bind(this),
        );
    });
  }

  removeEmptyValues(obj) {
    for (var i in obj) {
      if (obj[i] === null || obj[i].length == 0) {
        delete obj[i];
      } else if (typeof obj[i] === 'object') {
        this.removeEmptyValues(obj[i]);
      }
    }
  }

  processInputData() {
    this.personData = {
      person: {
        first_name: this.container.querySelector('[data-first-name]').value,
        last_name: this.container.querySelector('[data-last-name]').value,
        address: {
          line1: this.container.querySelector('[data-address]').value,
          city: this.container.querySelector('[data-city]').value,
          state: this.container.querySelector('[data-state]').value,
          postal_code: this.container.querySelector('[data-zip]').value,
        },
      },
    };

    let companyContainer = document.querySelector('.company:not(:disabled)');
    this.personData.person.relationship = {
      account_opener: true,
      director: true,
      owner: true,
      percent_ownership: 100,
    };
    let idNumberField = this.container.querySelector('[data-id-number]');
    if (idNumberField) {
      this.personData.person.id_number = idNumberField.value;
    }

    let phoneField = this.container.querySelector('[data-phone]');
    if (phoneField) {
      this.personData.person.phone = phoneField.value;
    }

    let ssnLastField = this.container.querySelector('[data-ssn-last-4]');
    if (ssnLastField && ssnLastField.value.length == 4) {
      this.personData.person.ssn_last_4 = ssnLastField.value;
    }

    let emailField = this.container.querySelector('[data-email]');
    if (emailField) {
      this.personData.person.email = emailField.value;
    }

    let titleField = this.container.querySelector('[data-title]');
    if (titleField) {
      this.personData.person.relationship = {};
      this.personData.person.relationship.title = titleField.value;
    }

    let dobValue = this.container.querySelector('[data-date-of-birth]').value;
    if (dobValue.length != 0) {
      let dob = dobValue.split('/');
      this.personData.person.dob = {};
      if (dob[0] != undefined) this.personData.person.dob.month = dob[0];
      if (dob[1] != undefined) this.personData.person.dob.day = dob[1];
      if (dob[2] != undefined) this.personData.person.dob.year = dob[2];
    }
  }
}

const stripe = Stripe(stripe_pk);
const myForm = document.querySelector('.create_account');
myForm.addEventListener('submit', handleForm);

const cardElement = document.querySelector('#card-element');
const element =
  cardElement != null && cardElement != undefined ? new StripeElements() : null;

const resolvedPromise = msg => {
  console.log('RESOLVED PROMISE', msg);
  return Promise.resolve(msg);
};

const processExternalAccountCard = () => {
  let debit_fieldset = document.querySelector('.debit_external_account');

  if (debit_fieldset == null || debit_fieldset.hasAttribute('disabled'))
    return resolvedPromise('External Account Disabled');

  let cc_fieldset = document.querySelector('.cc_fields');
  if (cc_fieldset == null || cc_fieldset.hasAttribute('disabled'))
    return resolvedPromise('External Account Disabled');

  return element.getToken();
};

const slugify = string => {
  if (string == undefined) {
    return;
  }
  const a =
    'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;';
  const b =
    'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnooooooooprrsssssttuuuuuuuuuwxyyzzz------';
  const p = new RegExp(a.split('').join('|'), 'g');

  return string
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/\[+/g, '-') // Replace [ with -
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word characters
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};

const processExternalAccount = () => {
  let bank_account_container = document.querySelector('.external_account');

  if (
    bank_account_container == null ||
    bank_account_container.hasAttribute('disabled')
  )
    return resolvedPromise('External Account Disabled');

  let cc_fieldset = document.querySelector('.ba_fields');
  if (cc_fieldset == null || cc_fieldset.hasAttribute('disabled'))
    return resolvedPromise('External Account Disabled');

  let bank_account = {
    country: bank_account_container.querySelector('[data-country]').value,
    currency: bank_account_container.querySelector('[data-currency]').value,
    account_number: bank_account_container.querySelector(
      '[data-account-number]',
    ).value,
    account_holder_name: bank_account_container.querySelector(
      '[data-account-holder-name]',
    ).value,
    account_holder_type: bank_account_container.querySelector(
      '[data-account-holder-type]',
    ).value,
  };

  let routingNumberInput = bank_account_container.querySelector(
    '[data-routing-number]',
  );
  if (routingNumberInput) {
    bank_account.routing_number = routingNumberInput.value;
  }

  removeEmptyValues(bank_account);
  return stripe
    .createToken('bank_account', bank_account)
    .then(function(result) {
      if (result.error) {
        console.log('THEN', result.error);
        document.querySelector('.external_account .errors').textContent =
          result.error.message;
        document.querySelector('.external_account .errors').scrollIntoView();
        return Promise.reject();
      } else {
        console.log('YAY SETTING TOKEN', result.token.id);
        document.querySelector('[data-external-account]').value =
          result.token.id;

        return resolvedPromise('Bank Account Set');
      }
    })
    .catch(function(result) {
      console.log('CATCH', result);
      return Promise.reject();
    });
};

const removeEmptyValues = obj => {
  for (var i in obj) {
    if (obj[i] === null || obj[i].length == 0) {
      delete obj[i];
    } else if (typeof obj[i] === 'object') {
      this.removeEmptyValues(obj[i]);
    }
  }
};

const processIndividual = () => {
  console.log('processing individual account');
  let individualRadio = document.querySelector('[data-individual-account]');
  if (typeof individualRadio == 'undefined' || individualRadio == null) {
    return resolvedPromise('Individual Disabled');
  }

  if (!individualRadio.checked || individualRadio.disabled) {
    return resolvedPromise('Individual Disabled');
  }

  return stripe
    .createToken('account', {
      business_type: 'individual',
      // individual: individualData(individualContainer),
      tos_shown_and_accepted: true,
    })
    .then(
      function(result) {
        if (result.error) {
          const errorElement = (individualContainer.querySelector(
            '.errors',
          ).textContent = result.error.message);
          return Promise.reject();
        } else {
          console.log('INDIVIDUAL ACCOUNT result', result);
          document.querySelector('#account-token').value = result.token.id;
          return resolvedPromise('Individual Token Set');
        }
      },
      function(error) {
        console.log('INDIVIDUAL ACCOUNT ERROR result', error);
      },
    );
};

const individualData = individualContainer => {
  let data = {
    email: individualContainer.dataset.email,
    first_name: individualContainer.querySelector('[data-first-name]').value,
    last_name: individualContainer.querySelector('[data-last-name]').value,
    address: {
      line1: individualContainer.querySelector('[data-address]').value,
      city: individualContainer.querySelector('[data-city]').value,
      state: individualContainer.querySelector('[data-state]').value,
      postal_code: individualContainer.querySelector('[data-zip]').value,
    },
  };

  let idNumberField = individualContainer.querySelector('[data-id-number]');
  if (idNumberField) {
    data.id_number = idNumberField.value;
  }

  let ssnLastField = individualContainer.querySelector('[data-ssn-last-4]');
  if (ssnLastField && ssnLastField.value.length == 4) {
    data.ssn_last_4 = ssnLastField.value;
  }

  let phoneField = individualContainer.querySelector('[data-phone]');
  if (phoneField && phoneField.value.length > 0) {
    data.phone = phoneField.value;
  }

  let dobValue = individualContainer.querySelector('[data-date-of-birth]')
    .value;
  if (dobValue.length != 0) {
    let dob = dobValue.split('/');
    data.dob = {};
    if (dob[0] != undefined) data.dob.month = dob[0];
    if (dob[1] != undefined) data.dob.day = dob[1];
    if (dob[2] != undefined) data.dob.year = dob[2];
  }

  return data;
};

const processCompany = () => {
  let companyContainer = document.querySelector('.company');

  if (companyContainer == null || companyContainer.hasAttribute('disabled'))
    return resolvedPromise('Company Disabled');

  let company = {
    name: companyContainer.querySelector('[data-business-name]').value,
    directors_provided: true,
    address: {
      line1: companyContainer.querySelector('[data-company-address-line1]')
        .value,
      city: companyContainer.querySelector('[data-company-address-city]').value,
      state: companyContainer.querySelector('[data-company-address-state]')
        .value,
      postal_code: companyContainer.querySelector(
        '[data-company-address-postal-code]',
      ).value,
    },
  };

  let phoneField = companyContainer.querySelector('[data-phone]');
  if (phoneField && phoneField.value.length > 0) {
    company.phone = phoneField.value;
  }

  let tax_id = companyContainer.querySelector('[data-tax-id]').value;
  if (tax_id.length != 0) {
    console.log('Setting tax id', tax_id);
    company.tax_id = tax_id;
  }
  return stripe
    .createToken('account', {
      business_type: 'company',
      company: company,
      tos_shown_and_accepted: true,
    })
    .then(function(result) {
      if (result.error) {
        const errorElement = (companyContainer.querySelector(
          '.errors',
        ).textContent = result.error.message);
        return Promise.reject();
      } else {
        console.log('Company result', result);
        document.querySelector('#account-token').value = result.token.id;
        return resolvedPromise('Business Token Set');
      }
    });
};

const processPersons = () => {
  const persons = document.querySelectorAll('[data-person]:not(:disabled)');
  if (persons.length == 0) return Promise.resolve();
  let personPromises = [];

  for (i = 0; i < persons.length; ++i) {
    personPromises.push(new StripePerson(persons[i]));
  }

  return Promise.all(personPromises);
};

const getAccountStatus = accountId => {
  fetch(`/payments/api/account/${accountId}.json`)
    .then(function(response) {
      if (!response.ok) {
        throw Error(response.statusText);
      }
      return response.json();
    })
    .then(function(account) {
      if (account.queued == 'true') {
        setTimeout(function() {
          getAccountStatus(accountId);
        }, 1000);
      } else if (
        account.last_error.length > 0 &&
        account.last_error != 'null'
      ) {
        let accountError = JSON.parse(account.last_error);

        console.log('slugify(accountError.param)', slugify(accountError.param));
        let inputField = myForm.querySelector(
          `[data-${slugify(accountError.param)}]`,
        );

        if (typeof inputField != 'undefined' && inputField != null) {
          inputField.classList.add('is-invalid');
        }

        myForm.querySelector('.account-errors').textContent =
          accountError.message;

        myForm.querySelector('.account-errors').scrollIntoView();
        myForm.querySelector('[data-stripe-account-submit]').disabled = false;
        myForm.querySelector('#cover-spin').style.display = 'none';
      } else {
        console.log('All good - reloading');
        location.href = location.href;
      }
    })
    .catch(function(error) {
      console.log(error);
    });
};

async function handleForm(event) {
  event.preventDefault();
  document.querySelector('#cover-spin').style.display = 'block';
  event.target.querySelector('[data-stripe-account-submit]').disabled = true;

  let stripePromises = [];
  stripePromises.push(processExternalAccountCard());
  stripePromises.push(processExternalAccount());
  stripePromises.push(processIndividual());
  stripePromises.push(processCompany());

  Promise.all(stripePromises)
    .then(function() {
      stripePromises.push(processPersons());

      Promise.all(stripePromises)
        .then(submitAccount, handleError)
        .catch(handleError);
    }, handleError)
    .catch(handleError);
}

const handleError = error => {
  document.querySelector('[data-stripe-account-submit]').disabled = false;
  document.querySelector('#cover-spin').style.display = 'none';
  console.log('error', error);
};

const submitAccount = result => {
  const data = new URLSearchParams();

  for (const pair of new FormData(myForm)) {
    data.append(pair[0], pair[1]);
  }

  fetch('/api/customizations', {
    method: 'post',
    body: data,
  })
    .then(function(response) {
      if (!response.ok) {
        throw Error(response.statusText);
      }
      return response.json();
    })
    .then(function(response) {
      const accountIdInput = myForm.querySelector('[data-default-data-id]');
      if (accountIdInput && accountIdInput.value.length > 0) {
        const accountId = accountIdInput.value;
        getAccountStatus(accountId);
      } else {
        location.href = location.href;
      }
    })
    .catch(function(error) {
      console.log('SUBMITING');
      console.log(error);
    });
};

const onContent = el => {
  el.classList.remove('collapse');
  el.removeAttribute('disabled');
};

const offContent = el => {
  el.classList.add('collapse');
  el.setAttribute('disabled', 'disabled');
};

const onSwitch = el => el.classList.add('active');
const offSwitch = el => el.classList.remove('active');
const toggleRadio = el => {
  const clicked = el;
  const id = clicked.dataset.toggleSwitch;
  const target = clicked.dataset.toggleTarget;

  // Turn all off
  Array.prototype.slice
    .call(document.querySelectorAll(`[data-toggle-switch="${id}"]`))
    .map(offSwitch);
  Array.prototype.slice
    .call(document.querySelectorAll(`[data-toggle-target="${id}"]`))
    .map(offContent);

  // Turn off some
  onSwitch(clicked);
  Array.prototype.slice
    .call(document.querySelectorAll(`[data-toggle-content="${target}"]`))
    .map(onContent);
};

Array.prototype.slice
  .call(document.querySelectorAll('[data-toggle-switch]'))
  .map(el => {
    el.addEventListener('change', e => {
      toggleRadio(e.target);
    });
  });

Array.prototype.slice
  .call(document.querySelectorAll('a[data-toggle-switch]'))
  .map(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      toggleRadio(e.target);
    });
  });

Array.prototype.slice
  .call(document.querySelectorAll('[data-toggle-switch]:checked'))
  .map(el => {
    toggleRadio(el);
  });
