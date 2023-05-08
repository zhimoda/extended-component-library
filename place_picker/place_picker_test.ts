/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// import 'jasmine'; (google3-only)

import {html, LitElement, TemplateResult} from 'lit';
import {customElement} from 'lit/decorators.js';

import {Environment} from '../testing/environment.js';
import {FakeLatLng, makeFakePlace} from '../testing/fake_place.js';
import {getDeepActiveElement} from '../utils/deep_element_access.js';

import {PLACE_DATA_FIELDS, PLACE_RESULT_DATA_FIELDS, PlacePicker} from './place_picker.js';

const FAKE_LOCATION = new FakeLatLng(-1, 1);

const FAKE_BOUNDS = {
  east: 1,
  north: 1,
  south: -1,
  west: -1,
};

const FAKE_PLACE_RESULT_FROM_AUTOCOMPLETE = {
  place_id: 'FAKE_AUTOCOMPLETE_PLACE_ID',
  geometry: {
    location: FAKE_LOCATION,
  },
  name: 'Fake Place from Autocomplete',
};

const FAKE_PLACE_FROM_QUERY = makeFakePlace({id: 'FAKE_QUERY_PLACE_ID'});

const FAKE_MAPS_LIBRARY = {
  Map: class {},
  Circle: class {
    getBounds = () => FAKE_BOUNDS;
  },
};

const FAKE_MAP = new FAKE_MAPS_LIBRARY.Map() as google.maps.Map;

@customElement('gmp-map')
class FakeMapElement extends LitElement {
  readonly innerMap = FAKE_MAP;
}

let placeSelectionHandler: Function;
const FAKE_PLACES_LIBRARY = {
  Autocomplete: class {
    addListener(eventName: string, handler: Function) {
      if (eventName !== 'place_changed') throw new Error('Not implemented');
      placeSelectionHandler = handler;
    }
    bindTo(key: string, target: google.maps.MVCObject) {}
    getBounds = () => FAKE_BOUNDS;
    getPlace = () => FAKE_PLACE_RESULT_FROM_AUTOCOMPLETE;
    setOptions(options: google.maps.places.AutocompleteOptions) {}
  },
  Place: class {
    static findPlaceFromQuery(
        request: google.maps.places.FindPlaceFromQueryRequest) {
      return Promise.resolve({places: [FAKE_PLACE_FROM_QUERY]});
    }
  },
};

describe('PlacePicker', () => {
  const env = new Environment();

  async function prepareState(template?: TemplateResult) {
    const root =
        env.render(template ?? html`<gmpx-place-picker></gmpx-place-picker>`);

    const picker = root.querySelector<PlacePicker>('gmpx-place-picker')!;
    env.importLibrarySpy?.withArgs('maps', picker)
        .and.returnValue(FAKE_MAPS_LIBRARY);
    env.importLibrarySpy?.withArgs('places', picker)
        .and.returnValue(FAKE_PLACES_LIBRARY);

    await env.waitForStability();

    const input = picker.renderRoot.querySelector('input')!;
    const searchButton =
        picker.renderRoot.querySelector<HTMLButtonElement>('.search-button')!;
    const clearButton =
        picker.renderRoot.querySelector<HTMLButtonElement>('.clear-button')!;
    return {root, picker, input, searchButton, clearButton};
  }

  async function enterQueryText(input: HTMLInputElement, query = 'some text') {
    input.value = query;
    input.dispatchEvent(new InputEvent('input'));
    await env.waitForStability();
  }

  it('is defined', () => {
    const el = document.createElement('gmpx-place-picker');
    expect(el).toBeInstanceOf(PlacePicker);
  });

  it('delegates focus to input element on focus()', async () => {
    const {picker, input} = await prepareState();

    picker.focus();

    expect(getDeepActiveElement()).toBe(input);
  });

  it('initializes Autocomplete widget with minimum configs', async () => {
    spyOn(FAKE_PLACES_LIBRARY, 'Autocomplete').and.callThrough();
    const {picker, input, searchButton, clearButton} = await prepareState();

    expect(FAKE_PLACES_LIBRARY.Autocomplete).toHaveBeenCalledOnceWith(input, {
      bounds: undefined,
      componentRestrictions: undefined,
      fields: [...PLACE_RESULT_DATA_FIELDS],
      strictBounds: false,
    });
    expect(input.placeholder).toBe('');
    expect(picker.value).toBeUndefined();
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeTrue();
  });

  it(`initializes Autocomplete widget based on attributes`, async () => {
    spyOn(FAKE_MAPS_LIBRARY, 'Circle').and.callThrough();
    spyOn(FAKE_PLACES_LIBRARY, 'Autocomplete').and.callThrough();
    const {input} = await prepareState(html`
      <gmpx-place-picker
        country="us ca"
        location-bias="12,34"
        placeholder="Search nearby places"
        radius="1000"
        type="street_address"
        strict-bounds
      ></gmpx-place-picker>
    `);

    expect(FAKE_MAPS_LIBRARY.Circle)
        .toHaveBeenCalledOnceWith({center: {lat: 12, lng: 34}, radius: 1000});
    expect(FAKE_PLACES_LIBRARY.Autocomplete).toHaveBeenCalledOnceWith(input, {
      bounds: FAKE_BOUNDS,
      componentRestrictions: {country: ['us', 'ca']},
      fields: [...PLACE_RESULT_DATA_FIELDS],
      strictBounds: true,
      types: ['street_address'],
    });
    expect(input.placeholder).toBe('Search nearby places');
  });

  it(`updates Autocomplete options when relevant props change`, async () => {
    const setOptionsSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'setOptions')
            .and.callThrough();
    const {picker} = await prepareState();

    picker.country = ['uk'];
    picker.locationBias = {lat: 12, lng: 34};
    picker.radius = 1000;
    picker.strictBounds = true;
    picker.type = 'restaurant';
    await env.waitForStability();

    expect(setOptionsSpy).toHaveBeenCalledOnceWith({
      bounds: FAKE_BOUNDS,
      componentRestrictions: {country: ['uk']},
      fields: [...PLACE_RESULT_DATA_FIELDS],
      strictBounds: true,
      types: ['restaurant'],
    });
  });

  it(`doesn't define bounds when only location bias is specified`, async () => {
    const setOptionsSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'setOptions')
            .and.callThrough();
    const {picker} = await prepareState();

    picker.locationBias = {lat: 12, lng: 34};
    await env.waitForStability();

    expect(setOptionsSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      bounds: undefined,
    }));
  });

  it(`doesn't define bounds when only radius is specified`, async () => {
    const setOptionsSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'setOptions')
            .and.callThrough();
    const {picker} = await prepareState();

    picker.radius = 1000;
    await env.waitForStability();

    expect(setOptionsSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      bounds: undefined,
    }));
  });

  it(`doesn't update Autocomplete when no relevant props change`, async () => {
    const setOptionsSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'setOptions')
            .and.callThrough();
    const {picker} = await prepareState();

    picker.placeholder = 'Search nearby places';
    await env.waitForStability();

    expect(setOptionsSpy).not.toHaveBeenCalled();
  });

  it(`enables search & clear buttons on user input`, async () => {
    const dispatchEventSpy = spyOn(PlacePicker.prototype, 'dispatchEvent');
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input);

    expect(picker.value).toBeUndefined();
    expect(searchButton.disabled).toBeFalse();
    expect(clearButton.hidden).toBeFalse();
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  it(`disables search & clear buttons when user deletes all text`, async () => {
    const dispatchEventSpy = spyOn(PlacePicker.prototype, 'dispatchEvent');
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input);
    await enterQueryText(input, '');

    expect(picker.value).toBeUndefined();
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeTrue();
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  it(`sets value based on user selection and fires event`, async () => {
    const dispatchEventSpy = spyOn(PlacePicker.prototype, 'dispatchEvent');
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input);
    placeSelectionHandler();
    await env.waitForStability();

    const place = picker.value;
    expect(place).toBeDefined();
    expect(place!.id).toBe('FAKE_AUTOCOMPLETE_PLACE_ID');
    expect(place!.location).toBe(FAKE_LOCATION);
    expect(place!.displayName).toBe('Fake Place from Autocomplete');
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeFalse();
    expect(dispatchEventSpy)
        .toHaveBeenCalledOnceWith(new Event('gmpx-placechange'));
  });

  it(`sets value to undefined when place's cleared & fires event`, async () => {
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input);
    placeSelectionHandler();
    await env.waitForStability();

    const dispatchEventSpy = spyOn(PlacePicker.prototype, 'dispatchEvent');
    clearButton.click();
    await env.waitForStability();

    expect(picker.value).toBeUndefined();
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeTrue();
    expect(input.value).toBe('');
    expect(dispatchEventSpy)
        .toHaveBeenCalledOnceWith(new Event('gmpx-placechange'));
  });

  it(`sets value based on place returned by Find Place request`, async () => {
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input, '123 Main St');

    const findPlaceFromQuerySpy =
        spyOn(FAKE_PLACES_LIBRARY.Place, 'findPlaceFromQuery')
            .and.callThrough();
    const fetchFieldsSpy =
        spyOn(FAKE_PLACE_FROM_QUERY, 'fetchFields').and.callThrough();
    searchButton.click();
    await env.waitForStability();

    expect(findPlaceFromQuerySpy).toHaveBeenCalledOnceWith({
      query: '123 Main St',
      fields: ['id'],
      locationBias: FAKE_BOUNDS,
    });
    expect(fetchFieldsSpy).toHaveBeenCalledOnceWith({
      fields: [...PLACE_DATA_FIELDS],
    });
    const place = picker.value;
    expect(place!.id).toBe('FAKE_QUERY_PLACE_ID');
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeFalse();
  });

  it(`sets value to null if no search results and fires event`, async () => {
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input, '123 Main St');

    spyOn(FAKE_PLACES_LIBRARY.Place, 'findPlaceFromQuery').and.resolveTo({
      places: [],
    });
    const dispatchEventSpy = spyOn(PlacePicker.prototype, 'dispatchEvent');
    searchButton.click();
    await env.waitForStability();

    expect(picker.value).toBeNull();
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeFalse();
    expect(dispatchEventSpy)
        .toHaveBeenCalledOnceWith(new Event('gmpx-placechange'));
  });

  it(`dispatches request error event when search is rejected`, async () => {
    const {picker, input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input, '123 Main St');

    const error = new Error('some network error');
    spyOn(FAKE_PLACES_LIBRARY.Place, 'findPlaceFromQuery')
        .and.rejectWith(error);
    const dispatchEventSpy = spyOn(picker, 'dispatchEvent');
    searchButton.click();
    await env.waitForStability();

    expect(picker.value).toBeUndefined();
    expect(searchButton.disabled).toBeTrue();
    expect(clearButton.hidden).toBeFalse();
    expect(dispatchEventSpy)
        .toHaveBeenCalledOnceWith(
            jasmine.objectContaining({type: 'gmpx-requesterror', error}));
  });

  it(`moves focus to clear button when searching via keyboard`, async () => {
    const {input, searchButton, clearButton} = await prepareState();

    await enterQueryText(input);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    searchButton.focus();
    searchButton.click();
    await env.waitForStability();

    expect(getDeepActiveElement()).toBe(clearButton);
  });

  it(`moves focus to input when clearing via keyboard`, async () => {
    const {input, clearButton} = await prepareState();

    await enterQueryText(input);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    clearButton.focus();
    clearButton.click();
    await env.waitForStability();

    expect(getDeepActiveElement()).toBe(input);
  });

  it(`binds to map bounds imperatively via method`, async () => {
    const bindToSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'bindTo');
    const {picker} = await prepareState();

    await picker.bindTo(FAKE_MAP);

    expect(bindToSpy).toHaveBeenCalledOnceWith('bounds', FAKE_MAP);
  });

  it(`binds to map bounds declaratively via attribute`, async () => {
    const bindToSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'bindTo');
    const {root} = await prepareState(html`
      <gmpx-place-picker for-map="my-map"></gmpx-place-picker>
      <gmp-map id="my-map"></gmp-map>
    `);
    const mapElement = root.querySelector<FakeMapElement>('gmp-map')!;

    expect(bindToSpy).toHaveBeenCalledOnceWith('bounds', mapElement.innerMap);
  });

  it(`doesn't bind to map bounds when id matches no element`, async () => {
    const bindToSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'bindTo');
    await prepareState(html`
      <gmpx-place-picker for-map="my-map"></gmpx-place-picker>
    `);

    expect(bindToSpy).not.toHaveBeenCalled();
  });

  it(`doesn't bind to map bounds when id matches non-Map element`, async () => {
    const bindToSpy =
        spyOn(FAKE_PLACES_LIBRARY.Autocomplete.prototype, 'bindTo');
    await prepareState(html`
      <gmpx-place-picker for-map="my-map"></gmpx-place-picker>
      <div id="my-map"></div>
    `);

    expect(bindToSpy).not.toHaveBeenCalled();
  });
});
