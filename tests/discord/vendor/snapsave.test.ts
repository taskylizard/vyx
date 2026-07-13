import { expect, test } from 'vite-plus/test'
import { extractSnapSaveHTML } from '../../../src/discord/autoembeds/vendor/snapsave/decrypter.ts'
import {
  normalizeInstagramURL,
  parseSnapSaveHTML
} from '../../../src/discord/autoembeds/vendor/snapsave/instagram.ts'

test('extracts the rendered download HTML from decoded SnapSave JavaScript', () => {
  expect(
    extractSnapSaveHTML(
      'getElementById("download-section").innerHTML = "<a href=\\"https:\\/\\/cdn.example\\/video.mp4\\">Download<\\/a>"; document.getElementById("inputData").remove(); '
    )
  ).toBe('<a href="https://cdn.example/video.mp4">Download</a>')
})

test('surfaces errors from decoded SnapSave JavaScript', () => {
  expect(() =>
    extractSnapSaveHTML('document.querySelector("#alert").innerHTML = "Media unavailable";')
  ).toThrow('Media unavailable')
})

test('normalizes Instagram URLs and strips tracking parameters', () => {
  expect(normalizeInstagramURL('https://instagram.com/reel/example/?igsh=tracking')).toBe(
    'https://www.instagram.com/reel/example/'
  )
})

test('parses SnapSave video download items', () => {
  expect(
    parseSnapSaveHTML(`
      <div class="download-items">
        <div class="download-items__thumb">
          <img src="https://cdn.example/poster.jpg">
        </div>
        <div class="download-items__btn">
          <a href="https://cdn.example/video.mp4"><span>Download Video</span></a>
        </div>
      </div>
    `)
  ).toEqual({
    items: [
      {
        thumbnail: 'https://cdn.example/poster.jpg',
        type: 'video',
        url: 'https://cdn.example/video.mp4'
      }
    ]
  })
})

test('parses SnapSave image download items', () => {
  expect(
    parseSnapSaveHTML(`
      <div class="download-items">
        <div class="download-items__thumb">
          <img src="https://cdn.example/image.jpg">
        </div>
        <div class="download-items__btn"><span>Download Photo</span></div>
      </div>
    `)
  ).toEqual({
    items: [{ thumbnail: undefined, type: 'image', url: 'https://cdn.example/image.jpg' }]
  })
})

test('drops non-public media URLs from SnapSave responses', () => {
  expect(
    parseSnapSaveHTML(`
      <div class="download-items">
        <div class="download-items__thumb"><img src="javascript:alert(1)"></div>
        <div class="download-items__btn"><span>Download Photo</span></div>
      </div>
    `)
  ).toBeUndefined()
})
