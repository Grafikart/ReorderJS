# Drag'n Drop Sorter

## Pourquoi cette librairie ?

Parce que je voulais un système permettant de réorganiser des éléments en grille

- Qui supporte le mobile
- Qui ne rame pas (60fps)
- Qui soit animé

> je suis comme saint thomas, je ne crois que ce que je vois

[Démonstration](http://grafikart.github.io/ReorderJS/index.html)

## Comment ça marche ?

Le code html doit être comme suivi

```html
<div data-sortable=".item" id="sort1">
    <div class="item" data-position="0" data-id="2">...</div>
    <div class="item" data-position="1" data-id="1">...</div>
    <div class="item" data-position="2" data-id="3">...</div>
</div>
```

Et on intialise le Sorter de la manière suivante

```js
sortable = new Sortable(document.querySelector('#sort1'));
sortable.success = function(results){
    console.log(results);
}
```
